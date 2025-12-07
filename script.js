const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 50;
const G = 0.6; 
const MAX_TRAIL = 12; 
const MIN_STAR_MASS = 30;

// 恒星颜色光谱
const STAR_COLORS = [
    '#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'
];

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
    
    // 更新蓄力位置
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

// 1. 按下鼠标：开始蓄力
window.addEventListener('mousedown', (e) => {
    interaction.isMouseDown = true;
    interaction.clickStart = Date.now();
    interaction.x = e.clientX;
    interaction.y = e.clientY;
    // 提前决定颜色
    interaction.color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
});

// 2. 松开鼠标：生成恒星
window.addEventListener('mouseup', (e) => {
    if (!interaction.isMouseDown) return;
    interaction.isMouseDown = false;

    // 计算按压时长 (毫秒)
    const duration = Date.now() - interaction.clickStart;
    
    // 基础随机质量 + 蓄力加成
    // 按 1秒 (1000ms) 大约增加 100 质量
    const baseMass = 60 + Math.random() * 40;
    const chargeMass = Math.min(duration / 5, 200); // 上限加成 200
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
        
        if (this.isStar) {
            // 使用传入的质量，或者默认随机
            this.mass = massOverride || (60 + Math.random() * 80);
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 30;
            this.probeTimer = 0;
            this.fuel = 5; // 初始燃料
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
        // --- 1. 速度阻力 ---
        const maxSpeed = Math.max(3, 15 - (this.mass / 20)); 
        const currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (currentSpeed > maxSpeed) {
            const dragFactor = 0.95;
            this.vx *= dragFactor;
            this.vy *= dragFactor;
        }

        // --- 2. 轨迹记录 ---
        if (this.isProbe || Math.random() > 0.5) {
            this.history.push({x: this.x, y: this.y});
        }
        if (this.history.length > MAX_TRAIL) this.history.shift();

        // --- 3. 物理互动 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            if (!other.isStar) continue;
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
                else if (this.isStar && !other.isStar && !other.isProbe) {
                    this.absorb(other);
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

        // --- 4. 移动 ---
        this.x += this.vx;
        this.y += this.vy;

        // --- 5. 边界处理 ---
        if (this.isProbe) {
            if (this.x < -100 || this.x > canvas.width + 100 || 
                this.y < -100 || this.y > canvas.height + 100) {
                this.markedForDeletion = true;
            }
        } else {
            if (this.x < -50) this.x = canvas.width + 50;
            if (this.x > canvas.width + 50) this.x = -50;
            if (this.y < -50) this.y = canvas.height + 50;
            if (this.y > canvas.height + 50) this.y = -50;
        }

        // --- 6. 恒星发射探测器 ---
        if (this.isStar) {
            if (this.mass < MIN_STAR_MASS) {
                this.downgrade();
            } else {
                this.probeTimer++;
                // 门槛：质量>100, 燃料>3
                if (this.probeTimer > 80 && this.mass > 100 && this.fuel > 3) {
                    if (Math.random() < 0.03) {
                        this.launchProbe();
                        this.probeTimer = 0;
                        this.fuel -= 3; 
                    }
                }
            }
        }
    }

    absorb(prey) {
        this.mass += prey.mass;
        this.fuel += prey.isStar ? 10 : 1; 
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
        this.size = Math.min(Math.sqrt(this.mass) * 0.8, 40);
    }

    launchProbe() {
        // 在恒星边缘发射
        const angle = Math.random() * Math.PI * 2;
        const spawnDist = this.size + 5;
        const spawnX = this.x + Math.cos(angle) * spawnDist;
        const spawnY = this.y + Math.sin(angle) * spawnDist;

        const probe = new Particle(spawnX, spawnY);
        probe.isProbe = true;
        probe.size = 4; // 稍微大一点，方便画三角形
        probe.color = '#ffffff';
        
        // --- 核心更新：切向速度 (轨道飞行) ---
        // 1. 径向速度 (向外推一把，防止立刻撞回来)
        const radialSpeed = 2;
        const velRadialX = Math.cos(angle) * radialSpeed;
        const velRadialY = Math.sin(angle) * radialSpeed;

        // 2. 切向速度 (垂直于半径，产生公转效果)
        // 随机顺时针或逆时针
        const orbitDir = Math.random() < 0.5 ? 1 : -1;
        const orbitSpeed = 5 + Math.random() * 2; // 足够快才能入轨或逃逸
        
        // 计算切向向量 (-y, x)
        const velTanX = -Math.sin(angle) * orbitSpeed * orbitDir;
        const velTanY = Math.cos(angle) * orbitSpeed * orbitDir;

        // 3. 叠加恒星本身的速度
        probe.vx = this.vx + velRadialX + velTanX;
        probe.vy = this.vy + velRadialY + velTanY;
        
        particles.push(probe);
        effects.push(new Shockwave(spawnX, spawnY, this.color, 10));
    }

    draw() {
        // A. 探测器 (细长三角形)
        if (this.isProbe) {
            const angle = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.beginPath();
            
            // 细长造型：头长12，尾宽4
            ctx.moveTo(12, 0);  // 尖端
            ctx.lineTo(-4, -2); // 左尾
            ctx.lineTo(-4, 2);  // 右尾
            ctx.closePath();
            
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#0ff';
            ctx.fill();
            
            // 引擎喷射
            ctx.beginPath();
            ctx.moveTo(-4, 0);
            ctx.lineTo(-10, 0);
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
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

    // 绘制蓄力光圈 (如果正在按住鼠标)
    if (interaction.isMouseDown) {
        const duration = Date.now() - interaction.clickStart;
        // 计算预览大小
        const baseSize = Math.sqrt(60) * 0.8;
        const growSize = Math.sqrt(Math.min(duration / 5, 200)) * 0.5;
        const currentSize = baseSize + growSize;
        
        ctx.beginPath();
        ctx.arc(interaction.x, interaction.y, currentSize, 0, Math.PI * 2);
        ctx.strokeStyle = interaction.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 外部扩散波纹
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
    
    // 星际连线
    const stars = particles.filter(p => p.isStar);
    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            const s1 = stars[i];
            const s2 = stars[j];
            const dx = s1.x - s2.x;
            const dy = s1.y - s2.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 62500) { // 250px
                const dist = Math.sqrt(distSq);
                const opacity = 1 - (dist / 250);
                
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                
                if (s1.color === s2.color) {
                    ctx.strokeStyle = s1.color; 
                } else {
                    ctx.strokeStyle = '#ffffff'; 
                }
                
                ctx.globalAlpha = opacity * 0.4;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }
    }

    if (particles.length < 30) {
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