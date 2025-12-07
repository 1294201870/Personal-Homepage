const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 60; // 初始尘埃数量
const G = 0.6; 
const MAX_TRAIL = 12; 
const MIN_STAR_MASS = 30;

// 鼠标蓄力逻辑
let isMouseDown = false;
let pressStartTime = 0;

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

// --- 鼠标交互：蓄力创造 ---
window.addEventListener('mousedown', () => {
    isMouseDown = true;
    pressStartTime = Date.now();
});

window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    
    // 计算蓄力时间 (秒)，最大蓄力 2 秒
    const duration = Math.min((Date.now() - pressStartTime) / 1000, 2.0);
    const chargeMultiplier = 1 + duration * 2; // 1倍 到 5倍 加成
    
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    // 传入蓄力倍率
    const star = new Particle(e.clientX, e.clientY, true, color, chargeMultiplier);
    
    // 产生一个生成特效
    effects.push(new Shockwave(e.clientX, e.clientY, color, 10 * chargeMultiplier, false));
    
    particles.push(star);
    updateCounter();
});

function updateCounter() {
    const el = document.getElementById('particle-counter');
    const starCount = particles.filter(p => p.isStar).length;
    if(el) el.innerText = `STARS: ${starCount.toString().padStart(2, '0')} // NETWORK NODES: ${particles.length.toString().padStart(3, '0')}`;
}

// --- 粒子类 ---
class Particle {
    constructor(x, y, isStar = false, color = null, chargeMultiplier = 1) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        this.consumedCount = 0;
        
        if (this.isStar) {
            // 基础随机质量 (50~100) + 蓄力加成
            // 蓄力满时，质量可达 300+
            const baseMass = 50 + Math.random() * 50;
            this.mass = baseMass * chargeMultiplier;
            this.updateSize(); 
            
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 30 + (chargeMultiplier * 5); // 大恒星光晕更强
            this.fuel = 5; 
            this.probeTimer = 0;
        } else {
            this.mass = 1; 
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.vx = (Math.random() - 0.5) * 1.5;
            this.vy = (Math.random() - 0.5) * 1.5;
            this.glow = 0;
            this.isProbe = false;
        }
    }

    update(allParticles) {
        // --- 1. 物理阻力 ---
        // 质量越大，极速越低，转向越慢
        const maxSpeed = this.isProbe ? 15 : Math.max(2, 200 / this.mass);
        const currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        if (currentSpeed > maxSpeed) {
            this.vx *= 0.95;
            this.vy *= 0.95;
        }

        // --- 2. 轨迹 ---
        if (this.isProbe || Math.random() > 0.6) {
            this.history.push({x: this.x, y: this.y});
        }
        if (this.history.length > MAX_TRAIL) this.history.shift();

        // --- 3. 互动 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星产生引力
            if (!other.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            const minDist = (this.size + other.size) * 0.6; // 稍微放宽碰撞体积

            // 碰撞检测
            if (dist < minDist) {
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.absorb(other);
                    } else {
                        this.damage(other);
                    }
                } else if (this.isStar && !other.isStar && !other.isProbe) {
                    this.absorb(other);
                }
                continue;
            }

            // 引力场 (探测器受引力影响)
            if (dist > 10 && dist < 1500) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        this.x += this.vx;
        this.y += this.vy;

        // --- 边界 ---
        if (this.isProbe) {
            if (this.x < -100 || this.x > canvas.width + 100 || 
                this.y < -100 || this.y > canvas.height + 100) {
                this.markedForDeletion = true;
                updateCounter();
            }
        } else {
            if (this.x < -50) this.x = canvas.width + 50;
            if (this.x > canvas.width + 50) this.x = -50;
            if (this.y < -50) this.y = canvas.height + 50;
            if (this.y > canvas.height + 50) this.y = -50;
        }

        // --- 恒星 AI ---
        if (this.isStar) {
            if (this.mass < MIN_STAR_MASS) {
                this.downgrade();
            } else {
                this.probeTimer++;
                // 发射探测器门槛
                if (this.probeTimer > 80 && this.mass > 80 && this.fuel > 2) {
                    if (Math.random() < 0.04) {
                        this.launchProbe();
                        this.probeTimer = 0;
                        this.fuel -= 2;
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
        effects.push(new Shockwave(this.x, this.y, this.color, 1));
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
        this.vx += (dx/dist) * 0.5;
        this.vy += (dy/dist) * 0.5;
        
        if (Math.random() < 0.3) {
            effects.push(new Shockwave((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#ffffff', 2, true));
        }
    }

    downgrade() {
        this.isStar = false;
        this.color = '#555555';
        this.glow = 0;
        this.mass = 5;
        this.updateSize();
        effects.push(new Shockwave(this.x, this.y, '#ffffff', 5, true));
        updateCounter();
    }

    updateSize() {
        this.size = Math.min(Math.sqrt(this.mass) * 0.8, 50);
    }

    launchProbe() {
        // 在恒星边缘生成
        const angle = Math.random() * Math.PI * 2;
        const spawnDist = this.size + 5;
        const px = this.x + Math.cos(angle) * spawnDist;
        const py = this.y + Math.sin(angle) * spawnDist;

        const probe = new Particle(px, py);
        probe.isProbe = true;
        probe.size = 3; 
        probe.color = '#ffffff';

        // 初始速度 = 恒星速度 + 径向发射速度 + 切向轨道速度
        // 较大的切向速度 (Tangential Velocity) 有助于形成轨道
        const radialSpeed = 3;
        const tangentialSpeed = 4; 

        // 径向向量 (向外)
        const vrx = Math.cos(angle) * radialSpeed;
        const vry = Math.sin(angle) * radialSpeed;

        // 切向向量 (垂直于径向)
        const vtx = Math.cos(angle + Math.PI/2) * tangentialSpeed;
        const vty = Math.sin(angle + Math.PI/2) * tangentialSpeed;

        probe.vx = this.vx + vrx + vtx;
        probe.vy = this.vy + vry + vty;
        
        particles.push(probe);
    }

    draw() {
        // A. 探测器 (细长三角形)
        if (this.isProbe) {
            const angle = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            ctx.beginPath();
            // 更细长的造型
            ctx.moveTo(10, 0); // 头部更长
            ctx.lineTo(-4, -3); // 尾部更窄
            ctx.lineTo(-4, 3);
            ctx.closePath();
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#0ff';
            ctx.fill();
            ctx.restore();
            return;
        }

        // B. 轨迹 (无穿屏连线)
        if (this.history.length > 1) {
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this.history.length - 1; i++) {
                const p1 = this.history[i];
                const p2 = this.history[i+1];
                const distSq = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
                if (distSq < 2500) { // 阈值50px
                    if (!started) { ctx.moveTo(p1.x, p1.y); started = true; }
                    ctx.lineTo(p2.x, p2.y);
                } else {
                    started = false;
                }
            }
            const alpha = this.isStar ? 0.3 : 0.05;
            ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.1)';
            ctx.globalAlpha = alpha;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        // C. 本体
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

    // 过滤与更新
    particles = particles.filter(p => !p.markedForDeletion);
    effects = effects.filter(e => e.life > 0);

    particles.forEach(p => p.update(particles));
    effects.forEach(e => { e.update(); e.draw(); });
    
    // --- 粒子绘制与神经网络连线 (Neural Network) ---
    // 为了性能，我们把绘制和连线放在一起处理，或者分层处理
    // 这里采用嵌套循环进行连线，限制距离
    
    // 1. 先画所有粒子本体
    particles.forEach(p => p.draw());

    // 2. 画连线 (Neural Lines)
    // 这是一个 O(N^2) 操作，需要控制粒子总数
    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        
        // 探测器不参与连线，避免混乱
        if (p1.isProbe) continue; 

        // 只与后面所有的粒子比较，避免重复连线
        for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            if (p2.isProbe) continue;

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            
            // 快速距离检查 (Box check)
            if (Math.abs(dx) > 200 || Math.abs(dy) > 200) continue;

            const distSq = dx*dx + dy*dy;
            
            // 连线逻辑分级
            // A. 恒星-恒星 (远距离连接)
            if (p1.isStar && p2.isStar) {
                if (distSq < 60000) { // ~245px
                    const dist = Math.sqrt(distSq);
                    const opacity = 1 - (dist / 245);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    // 异色冲突白线，同色本色
                    ctx.strokeStyle = (p1.color === p2.color) ? p1.color : '#ffffff';
                    ctx.globalAlpha = opacity * 0.5;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            } 
            // B. 尘埃-尘埃 或 尘埃-恒星 (短距离神经网络)
            else {
                if (distSq < 6400) { // ~80px
                    const dist = Math.sqrt(distSq);
                    const opacity = 1 - (dist / 80);
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    // 神经网络通常是淡淡的青色
                    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
                    ctx.globalAlpha = opacity * 0.3; // 很淡
                    ctx.lineWidth = 0.3; // 很细
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }

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