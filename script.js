const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 60;
const G = 0.5; // 引力常数

// 恒星颜色光谱
const STAR_COLORS = [
    '#ff3366', // 红色文明
    '#00f0ff', // 蓝色文明
    '#ffcc00', // 黄色文明
    '#cc00ff', // 紫色文明
    '#ffffff'  // 白色文明
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
    const starCount = particles.filter(p => p.isStar).length;
    if(el) el.innerText = `STARS: ${starCount.toString().padStart(2, '0')} // ENTITIES: ${particles.length.toString().padStart(3, '0')}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = []; 
        
        // 探测器属性
        this.isProbe = false;
        
        if (this.isStar) {
            this.mass = 80; // 初始质量
            this.size = 6;
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 25;
            this.fuel = 0; // 燃料
        } else {
            // 小行星
            this.mass = 1;
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 1.5;
            this.vy = (Math.random() - 0.5) * 1.5;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // 1. 速度阻力逻辑
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        
        if (this.isStar) {
            const maxSpeed = Math.max(0.5, 300 / this.mass); 
            if (speed > maxSpeed) {
                this.vx *= 0.95;
                this.vy *= 0.95;
            }
        } else if (!this.isProbe) {
            if (speed > 12) {
                this.vx *= 0.9;
                this.vy *= 0.9;
            }
        }

        // 2. 轨迹记录
        if (!this.isProbe || (this.isProbe && this.history.length < 5)) {
             this.history.push({x: this.x, y: this.y});
             if (this.history.length > 10) this.history.shift();
        }

        // 3. 物理互动
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            if (!this.isStar && !other.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞逻辑
            if (dist < (this.size + other.size) * 0.7) {
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.merge(other);
                    } else {
                        if (!other.markedForDeletion) this.annihilate(other);
                    }
                    continue;
                }
                if (this.isStar && !other.isStar && !other.isProbe) {
                    this.absorb(other);
                    continue;
                }
            }

            // 引力逻辑
            if (dist > 10 && dist < 1200) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // 4. 移动
        this.x += this.vx;
        this.y += this.vy;

        // 5. 边界处理
        if (this.isProbe) {
            if (this.x < -50 || this.x > canvas.width + 50 || 
                this.y < -50 || this.y > canvas.height + 50) {
                this.markedForDeletion = true;
                updateCounter();
            }
        } else {
            // 循环宇宙
            if (this.x < -50) this.x = canvas.width + 50;
            if (this.x > canvas.width + 50) this.x = -50;
            if (this.y < -50) this.y = canvas.height + 50;
            if (this.y > canvas.height + 50) this.y = -50;
        }

        // 6. 发射探测器
        if (this.isStar) {
            if (this.mass > 120 && this.fuel > 5) {
                if (Math.random() < 0.02) {
                    this.launchProbe();
                    this.fuel -= 5;
                }
            }
        }
    }

    // --- 互动行为 ---
    absorb(prey) {
        this.mass += 0.5;
        this.fuel += 1;
        this.updateSize();
        prey.markedForDeletion = true;
    }

    merge(partner) {
        this.mass += partner.mass;
        this.fuel += partner.fuel;
        this.updateSize();
        effects.push(new Shockwave(this.x, this.y, this.color, 40));
        partner.markedForDeletion = true;
    }

    annihilate(enemy) {
        const damage = 2;
        this.mass -= damage;
        enemy.mass -= damage;
        if (Math.random() < 0.3) {
            effects.push(new Shockwave((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#ffffff', 10));
        }
        this.updateSize();
        this.checkDegrade();
    }

    updateSize() {
        this.size = Math.min(Math.sqrt(this.mass) * 0.8, 30);
    }

    checkDegrade() {
        if (this.mass < 20) {
            this.isStar = false;
            this.mass = 5;
            this.color = '#888888';
            this.glow = 0;
            updateCounter();
            effects.push(new Shockwave(this.x, this.y, '#ffffff', 20));
        }
    }

    launchProbe() {
        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#ffffff';
        probe.size = 3;
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 2;
        probe.vx = this.vx + Math.cos(angle) * speed;
        probe.vy = this.vy + Math.sin(angle) * speed;
        probe.angle = angle;
        particles.push(probe);
        effects.push(new Shockwave(this.x, this.y, this.color, 15));
    }

    draw() {
        // A. 探测器
        if (this.isProbe) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(-3, -3);
            ctx.lineTo(-3, 3);
            ctx.closePath();
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0ff';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(-8, 0);
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            return;
        }

        // B. 轨迹 (修复穿屏 Bug)
        if (this.history.length > 1 && !this.isProbe) {
            ctx.beginPath();
            let started = false;
            
            for (let i = 0; i < this.history.length - 1; i++) {
                const p1 = this.history[i];
                const p2 = this.history[i+1];
                
                // 计算两点距离，如果太远（比如超过100像素），说明发生了穿屏
                const distSq = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
                
                if (distSq < 10000) { // 阈值 100*100
                    if (!started) {
                        ctx.moveTo(p1.x, p1.y);
                        started = true;
                    }
                    ctx.lineTo(p2.x, p2.y);
                } else {
                    // 断开连接，重新开始下一段
                    started = false; 
                }
            }

            const alpha = this.isStar ? 0.3 : 0.1;
            ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.15)';
            ctx.globalAlpha = alpha;
            ctx.lineWidth = this.isStar ? 1 : 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        // C. 星体
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
        this.lineWidth = 3;
    }
    
    update() {
        this.radius += 2; 
        this.life -= 0.05;
        this.lineWidth *= 0.9;
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
    effects = effects.filter(e => e.life > 0);

    particles.forEach(p => {
        p.update(particles);
        p.draw();
    });

    effects.forEach(e => {
        e.update();
        e.draw();
    });

    if (particles.length < 30) {
        particles.push(new Particle());
    }
    
    if(Math.random() < 0.05) updateCounter();

    requestAnimationFrame(animate);
}

// 修复了反引号错误的卡片逻辑
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