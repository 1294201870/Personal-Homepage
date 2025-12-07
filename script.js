const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 50;
const G = 0.6; // 引力常数
const MAX_TRAIL = 12; 
const MIN_STAR_MASS = 30; // 恒星坍缩临界值

// 恒星颜色光谱
const STAR_COLORS = [
    '#ff3366', // 红
    '#00f0ff', // 蓝
    '#ffcc00', // 黄
    '#cc00ff', // 紫
    '#ffffff'  // 白
];

// UI 视差
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
    const starCount = particles.filter(p => p.isStar).length;
    if(el) el.innerText = `ACTIVE STARS: ${starCount.toString().padStart(2, '0')}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        
        // 新增：吞噬计数器 (用于决定何时发射火箭)
        this.consumedCount = 0;
        
        if (this.isStar) {
            this.mass = 80; // 初始质量
            this.size = 8;
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
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
        // --- 1. 速度阻力 (质量越大阻力越大) ---
        const maxSpeed = Math.max(3, 15 - (this.mass / 20)); 
        const currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (currentSpeed > maxSpeed) {
            const dragFactor = 0.95;
            this.vx *= dragFactor;
            this.vy *= dragFactor;
        }

        // --- 2. 轨迹记录 ---
        // 探测器轨迹更密集
        if (this.isProbe || Math.random() > 0.5) {
            this.history.push({x: this.x, y: this.y});
        }
        if (this.history.length > MAX_TRAIL) this.history.shift();

        // --- 3. 物理互动 (仅恒星和探测器会被引力影响，但探测器不受阻力) ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星产生引力
            if (!other.isStar) continue;
            // 只有恒星和其他小东西受引力影响
            if (!this.isStar && !other.isStar && !this.isProbe) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞半径
            const minDist = (this.size + other.size) * 0.7;

            // --- 碰撞判定 ---
            if (dist < minDist) {
                // A. 恒星 vs 恒星
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.absorb(other); 
                    } else {
                        this.damage(other);
                    }
                }
                // B. 恒星吃小行星
                else if (this.isStar && !other.isStar && !other.isProbe) { // 恒星一般不吃自己发的探测器
                    this.absorb(other);
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

        // --- 4. 移动 ---
        this.x += this.vx;
        this.y += this.vy;

        // --- 5. 边界处理 ---
        if (this.isProbe) {
            // 探测器逻辑：飞出屏幕即消失 (探索深空)
            if (this.x < -50 || this.x > canvas.width + 50 || 
                this.y < -50 || this.y > canvas.height + 50) {
                this.markedForDeletion = true;
            }
        } else {
            // 其他粒子：循环宇宙
            if (this.x < -50) this.x = canvas.width + 50;
            if (this.x > canvas.width + 50) this.x = -50;
            if (this.y < -50) this.y = canvas.height + 50;
            if (this.y > canvas.height + 50) this.y = -50;
        }

        // --- 6. 恒星逻辑 ---
        if (this.isStar) {
            // 坍缩检查
            if (this.mass < MIN_STAR_MASS) {
                this.downgrade();
            } else {
                // 发射探测器逻辑：
                // 1. 质量要大 (>150)
                // 2. 必须吃过东西 (consumedCount > 5)
                this.probeTimer++;
                if (this.probeTimer > 150 && this.mass > 150 && this.consumedCount > 5) {
                    // 几率发射
                    if (Math.random() < 0.02) {
                        this.launchProbe();
                        this.probeTimer = 0;
                        // 发射会消耗一点点质量
                        this.mass -= 5; 
                    }
                }
            }
        }
    }

    absorb(prey) {
        this.mass += prey.mass;
        this.size = Math.min(this.size + (prey.size * 0.1), 60);
        this.consumedCount++; // 增加吞噬计数
        
        effects.push(new Shockwave(this.x, this.y, this.color, 1, false));
        prey.markedForDeletion = true;
        updateCounter();
    }

    damage(enemy) {
        const damageAmount = 2;
        this.mass -= damageAmount;
        enemy.mass -= damageAmount;
        this.size = Math.max(this.size * 0.99, 1); 
        enemy.size = Math.max(enemy.size * 0.99, 1);
        
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const repelForce = 0.5;
        
        this.vx += (dx/dist) * repelForce;
        this.vy += (dy/dist) * repelForce;
        
        if (Math.random() < 0.3) {
            effects.push(new Shockwave(this.x + (dx/2), this.y + (dy/2), '#ffffff', 2, true));
        }
    }

    downgrade() {
        this.isStar = false;
        this.color = '#555555';
        this.glow = 0;
        this.mass = 5;
        this.size = Math.max(2, this.size / 2);
        effects.push(new Shockwave(this.x, this.y, '#ffffff', 3, true));
        updateCounter();
    }

    launchProbe() {
        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.size = 3; // 火箭尺寸
        probe.color = '#ffffff';
        const angle = Math.random() * Math.PI * 2;
        const launchSpeed = 7; // 极快
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
            const alpha = this.isStar ? 0.3 : 0.1;
            ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.1)';
            if (this.isProbe) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // 火箭轨迹
                ctx.lineWidth = 1;
            } else {
                ctx.lineWidth = this.isStar ? 1 : 0.5;
            }
            ctx.stroke();
        }

        // 绘制本体
        if (this.isProbe) {
            // --- 绘制小火箭 (三角形) ---
            const angle = Math.atan2(this.vy, this.vx); // 计算朝向
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle); // 旋转画布
            ctx.beginPath();
            // 简单的三角形火箭
            ctx.moveTo(this.size * 2, 0); // 头部
            ctx.lineTo(-this.size, -this.size); // 左尾
            ctx.lineTo(-this.size, this.size); // 右尾
            ctx.closePath();
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.restore();
        } else {
            // 普通圆形粒子
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            
            if (this.isStar) {
                ctx.shadowBlur = this.glow;
                ctx.shadowColor = this.color;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }
}

// --- 冲击波特效 ---
class Shockwave {
    constructor(x, y, color, intensity = 1, isViolent = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = 30 * intensity;
        this.life = 1.0;
        this.lineWidth = isViolent ? 4 : 2;
        this.decay = isViolent ? 0.05 : 0.02; 
    }
    
    update() {
        this.radius += 2;
        this.life -= this.decay;
    }
    
    draw() {
        if (this.life <= 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.lineWidth = this.lineWidth;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

function init() {
    particles = [];
    effects = [];
    for (let i = 0; i < INITIAL_ASTEROIDS; i++) {
        particles.push(new Particle());
    }
    updateCounter();
}

function animate() {
    ctx.fillStyle = 'rgba(2, 2, 5, 0.4)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => !p.markedForDeletion);
    particles.forEach(p => {
        p.update(particles);
        p.draw();
    });

    effects = effects.filter(e => e.life > 0);
    effects.forEach(e => {
        e.update();
        e.draw();
    });

    if (particles.length < 20) {
        particles.push(new Particle());
    }
    
    requestAnimationFrame(animate);
}

// 3D 卡片 (这里修复了单引号问题)
document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((e.clientY - rect.top - centerY) / centerY) * -15; 
        const rotateY = ((e.clientX - rect.left - centerX) / centerX) * 15;
        // 修正处：使用反引号包裹模板字符串
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
    });
    card.addEventListener('mouseleave', () => {
        // 修正处：使用单引号字符串
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