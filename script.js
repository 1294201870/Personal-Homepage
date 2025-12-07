const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 60;
const G = 0.5; 
const MAX_TRAIL = 20; // 增加轨迹长度，让火箭拖尾更明显

const STAR_COLORS = ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'];

// --- 鼠标交互状态 ---
const mouseUI = { x: canvas.width / 2, y: canvas.height / 2 };
const interaction = {
    isMouseDown: false,
    clickStart: 0,
    x: 0,
    y: 0,
    color: '#ffffff'
};

// 视差
window.addEventListener('mousemove', (e) => {
    mouseUI.x = e.clientX;
    mouseUI.y = e.clientY;
    if (interaction.isMouseDown) {
        interaction.x = e.clientX;
        interaction.y = e.clientY;
    }
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouseUI.x - window.innerWidth / 2) * -0.01; 
        const moveY = (mouseUI.y - window.innerHeight / 2) * -0.01;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

window.addEventListener('mousedown', (e) => {
    interaction.isMouseDown = true;
    interaction.clickStart = Date.now();
    interaction.x = e.clientX;
    interaction.y = e.clientY;
    interaction.color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
});

window.addEventListener('mouseup', (e) => {
    if (!interaction.isMouseDown) return;
    interaction.isMouseDown = false;
    const duration = Date.now() - interaction.clickStart;
    const baseMass = 60 + Math.random() * 40;
    const chargeMass = Math.min(duration / 3, 300); // 蓄力上限提高
    const finalMass = baseMass + chargeMass;
    const star = new Particle(interaction.x, interaction.y, true, interaction.color, finalMass);
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
    constructor(x, y, isStar = false, color = null, massOverride = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        this.consumedCount = 0;
        
        // 火箭属性
        this.isProbe = false;
        this.probeFuel = 0; // 火箭自身燃料
        this.accel = 0;     // 加速度
        this.angle = 0;     // 飞行角度

        if (this.isStar) {
            this.mass = massOverride || (60 + Math.random() * 80);
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 30;
            this.probeTimer = 0;
            this.fuel = 5; 
        } else {
            this.mass = 1; 
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 2.0;
            this.vy = (Math.random() - 0.5) * 2.0;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // --- 1. 火箭加速逻辑 ---
        if (this.isProbe && this.probeFuel > 0) {
            // 有燃料时持续加速
            this.vx += Math.cos(this.angle) * this.accel;
            this.vy += Math.sin(this.angle) * this.accel;
            this.probeFuel -= 1; // 消耗燃料
            
            // 燃料耗尽，变回普通小行星
            if (this.probeFuel <= 0) {
                this.isProbe = false;
                this.color = `rgba(150, 255, 255, 0.8)`; // 废弃后的颜色
                effects.push(new Shockwave(this.x, this.y, '#ffffff', 5)); // 熄火特效
            }
        }

        // --- 2. 速度限制 (恒星强力限速) ---
        // 质量越大，限速越狠
        let maxSpeed = 15;
        if (this.isStar) {
            maxSpeed = Math.max(0.5, 200 / this.mass); 
        } else if (this.isProbe) {
            maxSpeed = 20; // 火箭可以很快
        }

        const currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (currentSpeed > maxSpeed) {
            const drag = 0.95;
            this.vx *= drag;
            this.vy *= drag;
        }

        // --- 3. 轨迹记录 ---
        // 火箭轨迹更密，普通粒子稀疏一点
        if (this.isProbe || Math.random() > 0.6) {
            this.history.push({x: this.x, y: this.y});
        }
        if (this.history.length > MAX_TRAIL) this.history.shift();

        // --- 4. 物理互动 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星有引力
            if (!other.isStar) continue;
            
            // 小行星/火箭受恒星影响，恒星受恒星影响
            if (!this.isStar && !other.isStar && !this.isProbe) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);
            const minDist = (this.size + other.size) * 0.7;

            // 碰撞
            if (dist < minDist) {
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.absorb(other); 
                    } else {
                        if(!other.markedForDeletion) this.damage(other);
                    }
                }
                else if (this.isStar && !other.isStar) {
                    // 恒星一般不吃自己刚发的还在加速的火箭，防止“出生即死”
                    if (!other.isProbe || other.probeFuel < 50) { 
                        this.absorb(other);
                    }
                }
                continue;
            }

            // 引力
            if (dist > 10 && dist < 1500) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // --- 5. 移动 ---
        this.x += this.vx;
        this.y += this.vy;

        // --- 6. 边界处理 (全部循环) ---
        // 既然火箭会变回小行星，就不让它消失了，让它留在屏幕里增加丰度
        const padding = 50;
        if (this.x < -padding) this.x = canvas.width + padding;
        if (this.x > canvas.width + padding) this.x = -padding;
        if (this.y < -padding) this.y = canvas.height + padding;
        if (this.y > canvas.height + padding) this.y = -padding;

        // --- 7. 恒星发射逻辑 ---
        if (this.isStar) {
            // 坍缩检查 (质量<30)
            if (this.mass < 30) {
                this.downgrade();
            } else {
                this.probeTimer++;
                // 门槛提高：质量 > 180 (大恒星才配发火箭)
                if (this.probeTimer > 120 && this.mass > 180 && this.fuel > 5) {
                    if (Math.random() < 0.03) {
                        this.launchProbe();
                        this.probeTimer = 0;
                        this.fuel -= 5; 
                    }
                }
            }
        }
    }

    absorb(prey) {
        this.mass += prey.mass;
        this.fuel += prey.isStar ? 10 : 2; 
        this.updateSize();
        this.consumedCount++;
        effects.push(new Shockwave(this.x, this.y, this.color, 1, false));
        prey.markedForDeletion = true;
        updateCounter();
    }

    damage(enemy) {
        const damage = 2;
        this.mass -= damage;
        enemy.mass -= damage;
        this.updateSize();
        enemy.updateSize();
        
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const repelForce = 0.5;
        this.vx += (dx/dist) * repelForce;
        this.vy += (dy/dist) * repelForce;
        
        if (Math.random() < 0.3) {
            effects.push(new Shockwave((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#ffffff', 2, true));
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

    updateSize() {
        // 允许恒星变得非常大 (上限 80)
        this.size = Math.min(Math.sqrt(this.mass) * 0.9, 80);
    }

    launchProbe() {
        // 切向发射
        const angle = Math.random() * Math.PI * 2;
        const spawnDist = this.size + 8;
        const spawnX = this.x + Math.cos(angle) * spawnDist;
        const spawnY = this.y + Math.sin(angle) * spawnDist;

        const probe = new Particle(spawnX, spawnY);
        probe.isProbe = true;
        probe.size = 5; 
        probe.color = '#ffffff';
        probe.probeFuel = 100; // 燃料寿命 100 帧
        
        // 初始速度：继承恒星 + 切向初速度
        const orbitDir = Math.random() < 0.5 ? 1 : -1;
        const startSpeed = 2; // 初始慢速
        const velTanX = -Math.sin(angle) * startSpeed * orbitDir;
        const velTanY = Math.cos(angle) * startSpeed * orbitDir;
        
        probe.vx = this.vx + velTanX;
        probe.vy = this.vy + velTanY;
        
        // 加速度方向 (切向加速)
        const accelAngle = Math.atan2(velTanY, velTanX);
        probe.angle = accelAngle;
        probe.accel = 0.15; // 每帧加速

        particles.push(probe);
        effects.push(new Shockwave(spawnX, spawnY, this.color, 8));
    }

    draw() {
        // A. 探测器
        if (this.isProbe) {
            // 实时更新角度朝向速度方向
            const moveAngle = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(moveAngle);
            
            ctx.beginPath();
            ctx.moveTo(10, 0); 
            ctx.lineTo(-6, -4); 
            ctx.lineTo(-6, 4); 
            ctx.closePath();
            
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0ff';
            ctx.fill();
            
            // 喷射火焰 (根据剩余燃料闪烁)
            if (Math.random() > 0.3) {
                ctx.beginPath();
                ctx.moveTo(-6, 0);
                ctx.lineTo(-12 - Math.random()*5, 0);
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            ctx.restore();
            return;
        }

        // B. 轨迹
        if (this.history.length > 1 && !this.isProbe) {
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this.history.length - 1; i++) {
                const p1 = this.history[i];
                const p2 = this.history[i+1];
                const distSq = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
                if (distSq < 10000) {
                    if (!started) {
                        ctx.moveTo(p1.x, p1.y);
                        started = true;
                    }
                    ctx.lineTo(p2.x, p2.y);
                } else {
                    started = false; 
                }
            }
            const alpha = this.isStar ? 0.3 : 0.05;
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
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// --- 冲击波 ---
class Shockwave {
    constructor(x, y, color, maxRadius = 30, isViolent = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = maxRadius;
        this.life = 1.0;
        this.lineWidth = isViolent ? 4 : 2;
        this.decay = isViolent ? 0.05 : 0.03;
    }
    
    update() {
        this.radius += 2; 
        this.life -= this.decay;
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

    // 绘制蓄力
    if (interaction.isMouseDown) {
        const duration = Date.now() - interaction.clickStart;
        const baseSize = Math.sqrt(60) * 0.9;
        const growSize = Math.sqrt(Math.min(duration / 3, 300)) * 0.5;
        const currentSize = baseSize + growSize;
        
        ctx.beginPath();
        ctx.arc(interaction.x, interaction.y, currentSize, 0, Math.PI * 2);
        ctx.strokeStyle = interaction.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(interaction.x, interaction.y, currentSize + (duration % 20), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,0.3)`;
        ctx.lineWidth = 1;
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
    
    // --- 神经网络 / 星际连线 ---
    // 为了性能，我们仍然需要限制连接数量
    // 逻辑：所有恒星互连 + 距离极近的任意粒子互连
    
    // 1. 恒星互连 (长距离)
    const stars = particles.filter(p => p.isStar);
    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            const s1 = stars[i];
            const s2 = stars[j];
            const dx = s1.x - s2.x;
            const dy = s1.y - s2.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 90000) { // 300px
                const dist = Math.sqrt(distSq);
                const opacity = 1 - (dist / 300);
                
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                
                if (s1.color === s2.color) {
                    ctx.strokeStyle = s1.color; 
                } else {
                    ctx.strokeStyle = '#ffffff'; 
                }
                
                ctx.globalAlpha = opacity * 0.3;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }
    }

    // 2. 神经网络连线 (短距离，任意粒子)
    // 为了防止卡顿，随机抽取一部分粒子进行检测，而不是全部两两对比
    // 或者限制距离非常短
    for (let i = 0; i < particles.length; i++) {
        // 性能优化：只检测它之后紧邻的几个粒子（近似随机）
        // 这样复杂度是 O(N) 而不是 O(N^2)
        const checkLimit = Math.min(particles.length, i + 10);
        for (let j = i + 1; j < checkLimit; j++) {
            const p1 = particles[i];
            const p2 = particles[j];
            
            // 忽略已经画过恒星连线的
            if (p1.isStar && p2.isStar) continue;

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distSq = dx*dx + dy*dy;

            // 距离限制：80px (6400)
            if (distSq < 6400) {
                 const dist = Math.sqrt(distSq);
                 const opacity = 1 - (dist / 80);
                 
                 ctx.beginPath();
                 ctx.moveTo(p1.x, p1.y);
                 ctx.lineTo(p2.x, p2.y);
                 ctx.strokeStyle = 'rgba(100, 200, 255, 0.2)'; // 淡淡的青色
                 ctx.globalAlpha = opacity * 0.3;
                 ctx.lineWidth = 0.3;
                 ctx.stroke();
                 ctx.globalAlpha = 1.0;
            }
        }
    }

    if (particles.length < 40) {
        particles.push(new Particle());
    }
    
    if(Math.random() < 0.05) updateCounter();

    requestAnimationFrame(animate);
}

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
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
    });
});

init();
animate();
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});