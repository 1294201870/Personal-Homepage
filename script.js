const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 50;
const G = 0.6; // 引力强度
const MAX_TRAIL = 12; // 轨迹长度
const SPEED_LIMIT = 12; // 光速限制 (超过此速度将被移除)

// 恒星颜色光谱
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
    if(el) el.innerText = `ENTITIES: ${particles.length.toString().padStart(3, '0')}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = []; // 轨迹
        
        if (this.isStar) {
            this.mass = 100; // 初始质量大
            this.size = 6 + Math.random() * 4;
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.5; // 恒星微动
            this.vy = (Math.random() - 0.5) * 0.5;
            this.glow = 30;
            this.probeTimer = 0;
        } else {
            this.mass = 1;
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 2.0;
            this.vy = (Math.random() - 0.5) * 2.0;
            this.glow = 0;
            this.isProbe = false;
        }
    }

    update(allParticles) {
        // 1. 速度检查 (光速限制)
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (speed > SPEED_LIMIT) {
            // 速度过快，产生一个消失特效并删除
            effects.push(new Shockwave(this.x, this.y, this.color, 5)); 
            this.markedForDeletion = true;
            return;
        }

        // 2. 轨迹记录
        this.history.push({x: this.x, y: this.y});
        if (this.history.length > MAX_TRAIL) this.history.shift();

        // 3. 引力与碰撞
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星产生引力
            if (!other.isStar && !this.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // --- 碰撞判定 ---
            if (dist < (this.size + other.size) * 0.6) {
                
                // 情况 A: 恒星吞恒星 (大的吃小的)
                if (this.isStar && other.isStar) {
                    if (this.mass >= other.mass) {
                        this.absorb(other, true); // 巨型合并
                    } 
                    // 如果我比对方小，下轮循环对方会吃掉我，此处略过
                }
                // 情况 B: 恒星吃小行星
                else if (this.isStar && !other.isStar) {
                    this.absorb(other, false);
                }
                continue;
            }

            // --- 引力计算 ---
            if (dist > 10 && dist < 1500) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // 4. 移动
        this.x += this.vx;
        this.y += this.vy;

        // 5. 边界处理 (Wrap Around)
        if (this.x < -50) this.x = canvas.width + 50;
        if (this.x > canvas.width + 50) this.x = -50;
        if (this.y < -50) this.y = canvas.height + 50;
        if (this.y > canvas.height + 50) this.y = -50;

        // 6. 恒星发射探测器逻辑
        if (this.isStar) {
            this.probeTimer++;
            // 质量越大，发射频率越高
            if (this.probeTimer > 200 && Math.random() < 0.005 * (this.mass/80)) {
                this.launchProbe();
                this.probeTimer = 0;
            }
        }
    }

    // 吞噬/合并逻辑
    absorb(prey, isMegaMerger) {
        this.mass += isMegaMerger ? prey.mass : 1; // 吞恒星全盘接收质量
        this.size = Math.min(this.size + (isMegaMerger ? 2 : 0.05), 40); // 变大
        
        // 产生冲击波
        const boomSize = isMegaMerger ? 80 : 20; // 恒星相撞特效更大
        effects.push(new Shockwave(this.x, this.y, this.color, boomSize));
        
        prey.markedForDeletion = true;
    }

    launchProbe() {
        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#ffffff';
        const angle = Math.random() * Math.PI * 2;
        const launchSpeed = 5;
        // 继承恒星速度 + 发射速度
        probe.vx = this.vx + Math.cos(angle) * launchSpeed;
        probe.vy = this.vy + Math.sin(angle) * launchSpeed;
        particles.push(probe);
    }

    draw() {
        // 绘制轨迹
        if (this.history.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.history[0].x, this.history[0].y);
            for (let i = 1; i < this.history.length; i++) {
                ctx.lineTo(this.history[i].x, this.history[i].y);
            }
            if (this.isProbe) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 1.5;
            } else {
                // 恒星轨迹稍微明显点
                const alpha = this.isStar ? 0.3 : 0.1;
                ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.15)';
                ctx.globalAlpha = alpha;
                ctx.lineWidth = this.isStar ? 1 : 0.5;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        if (this.isStar) {
            ctx.shadowBlur = this.glow;
            ctx.shadowColor = this.color;
        } else if (this.isProbe) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- 冲击波特效 ---
class Shockwave {
    constructor(x, y, color, maxRadius = 30) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = maxRadius;
        this.life = 1.0;
        this.lineWidth = 2;
    }
    
    update() {
        this.radius += 2; // 扩散速度
        this.life -= 0.04;
        this.lineWidth *= 0.95;
    }
    
    draw() {
        if (this.life <= 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // 解析 hex 颜色转 rgb 以使用透明度
        ctx.strokeStyle = this.color; // 简化处理，直接用原色，配合 globalAlpha
        ctx.globalAlpha = this.life;
        ctx.lineWidth = this.lineWidth;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
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
    // 使用较深的遮罩，让轨迹更像流星而非长线
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

    // 自动补充尘埃
    if (particles.length < 20) {
        particles.push(new Particle());
    }
    
    if (particles.some(p => p.markedForDeletion)) updateCounter();

    requestAnimationFrame(animate);
}

// 3D 卡片 (保持不变)
document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((e.clientY - rect.top - centerY) / centerY) * -15; 
        const rotateY = ((e.clientX - rect.left - centerX) / centerX) * 15;
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