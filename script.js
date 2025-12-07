const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 40;
const G = 0.5; 
const MAX_TRAIL = 15; // 轨迹加长一点
const MIN_STAR_MASS = 30;
const PROBE_COST = 15; // 发射一枚火箭消耗的恒星质量
const PROBE_FUEL_MAX = 1200; // 火箭燃料 (60fps * 20s = 1200帧)

// 鼠标交互状态
let isMouseDown = false;
let mousePressTimer = 0;

// 恒星颜色
const STAR_COLORS = ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'];

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

// --- 蓄力生成系统 ---
window.addEventListener('mousedown', () => {
    isMouseDown = true;
    mousePressTimer = 0;
});

window.addEventListener('mouseup', (e) => {
    isMouseDown = false;
    spawnStar(e.clientX, e.clientY, mousePressTimer);
});

function spawnStar(x, y, chargeTime) {
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    // 基础大小随机 + 蓄力加成 (最大蓄力加成约 5倍)
    const baseMass = 60 + Math.random() * 40;
    const chargeBonus = Math.min(chargeTime * 5, 300); // 蓄力上限
    const star = new Particle(x, y, true, color, baseMass + chargeBonus);
    particles.push(star);
    updateCounter();
}

function updateCounter() {
    const el = document.getElementById('particle-counter');
    const starCount = particles.filter(p => p.isStar).length;
    const probeCount = particles.filter(p => p.isProbe && p.fuel > 0).length;
    if(el) el.innerText = `STARS: ${starCount} // PROBES: ${probeCount} // TOTAL: ${particles.length}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null, mass = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        this.consumedCount = 0;
        
        // 探测器属性
        this.isProbe = false;
        this.fuel = 0;
        this.maxFuel = 0;

        if (this.isStar) {
            this.mass = mass || 80; 
            this.updateSize(); // 根据质量算大小
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 30;
            this.probeTimer = 0;
        } else {
            // 小行星
            this.mass = 1; 
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 2.0;
            this.vy = (Math.random() - 0.5) * 2.0;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // --- 1. 速度控制 ---
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        
        if (this.isStar) {
            // 恒星限速：质量越大越慢
            const maxSpeed = Math.max(0.5, 200 / this.mass); 
            if (speed > maxSpeed) {
                this.vx *= 0.95;
                this.vy *= 0.95;
            }
        } else if (this.isProbe) {
            // 火箭逻辑
            if (this.fuel > 0) {
                this.fuel--;
                // 加速过程 (推力)
                const maxProbeSpeed = 6;
                if (speed < maxProbeSpeed) {
                    this.vx *= 1.02;
                    this.vy *= 1.02;
                }
            } else {
                // 燃料耗尽 -> 变成死星 (太空垃圾)
                this.isProbe = false;
                this.isStar = false;
                this.color = '#888888'; // 变成灰色
                this.mass = 2; // 变成普通残骸
                effects.push(new Shockwave(this.x, this.y, '#ffffff', 5)); // 熄火特效
            }
        } else {
            // 普通小行星限速
            if (speed > 8) {
                this.vx *= 0.95;
                this.vy *= 0.95;
            }
        }

        // --- 2. 轨迹记录 ---
        if (this.isProbe || Math.random() > 0.6) {
             this.history.push({x: this.x, y: this.y});
             if (this.history.length > MAX_TRAIL) this.history.shift();
        }

        // --- 3. 物理互动 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // --- A. 连线特效 (距离近就连线) ---
            if (dist < 100) {
                // 仅绘制，不影响物理
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(other.x, other.y);
                const alpha = 1 - (dist / 100);
                // 恒星之间连线亮一点，小行星暗一点
                ctx.strokeStyle = (this.isStar || other.isStar) ? 
                    `rgba(100, 255, 255, ${alpha * 0.2})` : 
                    `rgba(100, 255, 255, ${alpha * 0.05})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }

            // --- B. 碰撞逻辑 ---
            const minDist = (this.size + other.size) * 0.7;
            if (dist < minDist) {
                // 探测器有燃料时无敌 (不被吃)
                if (this.isProbe && this.fuel > 0) continue;
                if (other.isProbe && other.fuel > 0) continue;

                // 恒星吃东西
                if (this.isStar) {
                    if (other.isStar) {
                        if (this.color === other.color) {
                            if (this.mass >= other.mass) this.merge(other);
                        } else {
                            if (!other.markedForDeletion) this.damage(other);
                        }
                    } else {
                        // 吃小行星
                        this.absorb(other);
                    }
                }
                continue;
            }

            // --- C. 引力逻辑 ---
            // 只有恒星有引力
            if (other.isStar && dist > 20 && dist < 1000) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // --- 4. 移动 ---
        this.x += this.vx;
        this.y += this.vy;

        // --- 5. 边界循环 (所有物体都循环，包括火箭) ---
        if (this.x < -50) this.x = canvas.width + 50;
        if (this.x > canvas.width + 50) this.x = -50;
        if (this.y < -50) this.y = canvas.height + 50;
        if (this.y > canvas.height + 50) this.y = -50;

        // --- 6. 恒星发射逻辑 ---
        if (this.isStar) {
            // 质量不足以降级
            if (this.mass < MIN_STAR_MASS) {
                this.downgrade();
            } else {
                this.probeTimer++;
                // 发射要求：质量 > 200 (更大才能发射), 间隔 > 300帧 (频率低)
                if (this.probeTimer > 300 && this.mass > 200) {
                    if (Math.random() < 0.05) {
                        this.launchProbe();
                        this.probeTimer = 0;
                    }
                }
            }
        }
    }

    updateSize() {
        // 体积无上限，但增长曲线平缓
        this.size = Math.sqrt(this.mass) * 0.8; 
    }

    absorb(prey) {
        this.mass += prey.mass;
        this.updateSize();
        prey.markedForDeletion = true;
        updateCounter();
    }

    merge(partner) {
        this.mass += partner.mass;
        this.updateSize();
        effects.push(new Shockwave(this.x, this.y, this.color, 40));
        partner.markedForDeletion = true;
    }

    damage(enemy) {
        const damage = 2;
        this.mass -= damage;
        enemy.mass -= damage;
        this.updateSize();
        enemy.updateSize();
        
        // 互斥
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const repelForce = 0.5;
        this.vx += (dx/dist) * repelForce;
        this.vy += (dy/dist) * repelForce;

        if (Math.random() < 0.3) {
            effects.push(new Shockwave((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#ffffff', 10));
        }
    }

    downgrade() {
        this.isStar = false;
        this.color = '#555555';
        this.glow = 0;
        this.mass = 10;
        this.updateSize();
        effects.push(new Shockwave(this.x, this.y, '#ffffff', 10));
        updateCounter();
    }

    launchProbe() {
        // 消耗自身质量
        this.mass -= PROBE_COST;
        this.updateSize();

        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.size = 3; 
        probe.color = '#aaaaaa'; // 本体金属灰
        probe.fuel = PROBE_FUEL_MAX;
        
        // 切向发射逻辑
        // 1. 获取到最近的大引力源的方向(或者简单点，随机切向)
        const angle = Math.random() * Math.PI * 2;
        // 2. 初始速度低
        const launchSpeed = 2; 
        
        // 切向：x = -sin, y = cos 模拟环绕
        // 这里简化为：继承恒星速度 + 随机方向弹射
        probe.vx = this.vx + Math.cos(angle) * launchSpeed;
        probe.vy = this.vy + Math.sin(angle) * launchSpeed;
        
        particles.push(probe);
        effects.push(new Shockwave(this.x, this.y, '#ffaa00', 15)); // 发射火焰波
    }

    draw() {
        // A. 探测器绘制
        if (this.isProbe) {
            const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            const angle = Math.atan2(this.vy, this.vx);
            
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            
            // 细长三角形 (金属灰)
            ctx.beginPath();
            ctx.moveTo(8, 0);   // 尖头更长
            ctx.lineTo(-4, -2); // 尾翼更窄
            ctx.lineTo(-4, 2);
            ctx.closePath();
            ctx.fillStyle = '#aaaaaa';
            ctx.fill();

            // 尾焰 (颜色随速度变亮)
            if (this.fuel > 0) {
                ctx.beginPath();
                ctx.moveTo(-4, 0);
                // 尾焰长度跟速度成正比
                const flameLen = 5 + speed * 2; 
                ctx.lineTo(-4 - flameLen, 0);
                ctx.strokeStyle = this.fuel > 200 ? '#ffaa00' : '#ff3333'; // 燃料足黄，不足红
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            ctx.restore();
            return;
        }

        // B. 轨迹
        if (this.history.length > 1) {
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this.history.length - 1; i++) {
                const p1 = this.history[i];
                const p2 = this.history[i+1];
                const distSq = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
                if (distSq > 10000) { started = false; continue; }
                if (!started) { ctx.moveTo(p1.x, p1.y); started = true; }
                ctx.lineTo(p2.x, p2.y);
            }
            const alpha = this.isStar ? 0.3 : 0.1;
            ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.1)';
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
        }
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

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

    // 鼠标蓄力特效
    if (isMouseDown) {
        mousePressTimer++;
        ctx.beginPath();
        ctx.arc(mouseUI.x, mouseUI.y, 10 + mousePressTimer * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(mousePressTimer/60, 1)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

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

// 3D 卡片逻辑
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