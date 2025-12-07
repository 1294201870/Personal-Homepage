const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙参数 ---
let particles = [];
let effects = []; // 专门存储特效(爆炸/冲击波)
const INITIAL_ASTEROIDS = 60;
const G = 0.5; // 引力
const MAX_TRAIL = 15; // 轨迹长度

// 恒星颜色库 (科幻感)
const STAR_COLORS = [
    '#ff3366', // 红超巨星
    '#00f0ff', // 蓝巨星
    '#ffcc00', // 黄矮星
    '#cc00ff', // 紫色中子星
    '#ffffff'  // 白矮星
];

// UI 视差鼠标
const mouseUI = { x: canvas.width / 2, y: canvas.height / 2 };
window.addEventListener('mousemove', (e) => {
    mouseUI.x = e.clientX;
    mouseUI.y = e.clientY;
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouseUI.x - window.innerWidth / 2) * -0.01; 
        const moveY = (mouseUI.y - window.innerHeight / 2) * -0.01;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

// 点击创造恒星
window.addEventListener('mousedown', (e) => {
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const star = new Particle(e.clientX, e.clientY, true, color);
    particles.push(star);
    updateCounter();
});

function updateCounter() {
    const el = document.getElementById('particle-counter');
    if(el) el.innerText = `OBJECTS: ${particles.length.toString().padStart(3, '0')}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        
        // 轨迹历史 [{x,y}, {x,y}...]
        this.history = []; 
        
        if (this.isStar) {
            this.mass = 80;
            this.size = 5 + Math.random() * 3;
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; // 恒星有极微小的漂移
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 25;
            this.probeTimer = 0; // 发射探测器计时器
        } else {
            this.mass = 1;
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 1.5;
            this.vy = (Math.random() - 0.5) * 1.5;
            this.glow = 0;
            this.isProbe = false; // 是否是探测器
        }
    }

    update(allParticles) {
        // 1. 记录轨迹
        this.history.push({x: this.x, y: this.y});
        if (this.history.length > MAX_TRAIL) {
            this.history.shift();
        }

        // 2. 引力与吞噬
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星有引力
            if (!other.isStar && !this.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 吞噬判定
            if (dist < (this.size + other.size) * 0.8) {
                if (this.isStar && !other.isStar) {
                    this.absorb(other);
                }
                continue;
            }

            // 引力计算
            if (dist > 10 && dist < 1200) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // 3. 移动
        this.x += this.vx;
        this.y += this.vy;

        // 4. 边界循环
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;

        // 5. 恒星逻辑：发射探测器
        if (this.isStar) {
            this.probeTimer++;
            // 每隔一段时间，大恒星会发射探测器 (质量越大发射越频繁)
            if (this.probeTimer > 300 && Math.random() < 0.01 * (this.mass/100)) {
                this.launchProbe();
                this.probeTimer = 0;
            }
        }
    }

    // 吞噬处理
    absorb(prey) {
        this.mass += 1;
        this.size = Math.min(this.size + 0.05, 25); // 限制最大体积
        
        // 产生吞噬特效 (冲击波)
        effects.push(new Shockwave(this.x, this.y, this.color));
        
        prey.markedForDeletion = true;
    }

    // 发射探测器
    launchProbe() {
        // 探测器是特殊的小粒子，速度极快，带高亮轨迹
        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#ffffff'; // 高亮白
        // 向随机方向高速发射
        const angle = Math.random() * Math.PI * 2;
        const speed = 4;
        probe.vx = Math.cos(angle) * speed + this.vx;
        probe.vy = Math.sin(angle) * speed + this.vy;
        particles.push(probe);
    }

    draw() {
        // 绘制轨迹 (流星尾巴)
        if (this.history.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.history[0].x, this.history[0].y);
            for (let i = 1; i < this.history.length; i++) {
                ctx.lineTo(this.history[i].x, this.history[i].y);
            }
            // 探测器轨迹更亮更实
            if (this.isProbe) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
            } else {
                // 普通粒子轨迹很淡
                ctx.strokeStyle = this.isStar ? 
                    `rgba(${hexToRgb(this.color)}, 0.2)` : 
                    'rgba(100, 200, 255, 0.1)';
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        }

        // 绘制本体
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        if (this.isStar) {
            ctx.shadowBlur = this.glow;
            ctx.shadowColor = this.color;
        } else if (this.isProbe) {
            ctx.shadowBlur = 10; // 探测器也发光
            ctx.shadowColor = '#fff';
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- 特效类：冲击波 ---
class Shockwave {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = 30;
        this.life = 1.0; // 透明度生命周期
    }
    
    update() {
        this.radius += 1; // 扩散
        this.life -= 0.05; // 消失
    }
    
    draw() {
        if (this.life <= 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${hexToRgb(this.color)}, ${this.life})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// 辅助：Hex 转 RGB 字符串 (用于 rgba)
function hexToRgb(hex) {
    // 简单处理 #RRGGBB
    if(hex.startsWith('#')) hex = hex.slice(1);
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r},${g},${b}`;
}

// 初始化
function init() {
    particles = [];
    effects = [];
    for (let i = 0; i < INITIAL_ASTEROIDS; i++) {
        particles.push(new Particle());
    }
    updateCounter();
}

// 动画循环
function animate() {
    // 用纯黑稍微淡化覆盖 (不再用长拖尾，改用 path 绘制真实拖尾)
    ctx.fillStyle = 'rgba(2, 2, 5, 0.4)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 更新粒子
    particles = particles.filter(p => !p.markedForDeletion);
    particles.forEach(p => {
        p.update(particles);
        p.draw();
    });

    // 更新特效
    effects = effects.filter(e => e.life > 0);
    effects.forEach(e => {
        e.update();
        e.draw();
    });

    if (particles.length < 20) {
        particles.push(new Particle()); // 自动补充宇宙尘埃
    }

    requestAnimationFrame(animate);
}

// 卡片 3D 逻辑
document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -15; 
        const rotateY = ((x - centerX) / centerX) * 15;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
});

init();
animate();
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});