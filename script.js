const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 40;
const G = 0.5; 
const LAUNCH_THRESHOLD = 120; 

// 恒星颜色
const STAR_COLORS = ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'];

// --- 鼠标交互 ---
const mouse = { x: 0, y: 0, isDown: false, charge: 30 };
const MAX_CHARGE = 200; 

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouse.x - window.innerWidth / 2) * -0.01; 
        const moveY = (mouse.y - window.innerHeight / 2) * -0.01;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

window.addEventListener('mousedown', () => {
    mouse.isDown = true;
    mouse.charge = 30; 
});

window.addEventListener('mouseup', () => {
    if (mouse.isDown) {
        spawnStarFromMouse();
        mouse.isDown = false;
    }
});

function spawnStarFromMouse() {
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const star = new Particle(mouse.x, mouse.y, true, color);
    star.mass = mouse.charge;
    star.updateSize();
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
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        
        this.vx = (Math.random() - 0.5) * 0.5; 
        this.vy = (Math.random() - 0.5) * 0.5;
        this.fuel = 0;
        this.isProbe = false;
        this.isDebris = false; 

        if (this.isStar) {
            this.mass = 80;
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx = 0; 
            this.vy = 0;
            this.glow = 30;
            this.probeTimer = 0;
        } else {
            this.mass = 1; 
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // --- 1. 探测器逻辑 ---
        if (this.isProbe) {
            if (this.fuel > 0) {
                this.fuel--; 
                const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                const maxProbeSpeed = 1.8; 
                
                if (speed < maxProbeSpeed) {
                    const angle = Math.atan2(this.vy, this.vx);
                    const thrust = 0.05; 
                    this.vx += Math.cos(angle) * thrust;
                    this.vy += Math.sin(angle) * thrust;
                }
                
                if (Math.random() < 0.4) {
                    effects.push(new ThrustParticle(this.x, this.y, this.vx, this.vy));
                }
            } else {
                this.convertToDebris();
            }
        }

        // --- 2. 速度阻力 ---
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        const globalLimit = (this.isProbe && this.fuel > 0) ? 5 : (this.isStar ? 1 : 2); 
        
        if (speed > globalLimit) {
            this.vx *= 0.95;
            this.vy *= 0.95;
        }

        // --- 3. 物理互动 (核心修复) ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星参与核心交互逻辑
            if (!other.isStar && !this.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞判定 (宽松一点)
            const minDist = (this.size + other.size) * 0.8; 

            if (dist < minDist) {
                // A. 恒星 vs 恒星
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.absorb(other); 
                    } else {
                        this.damage(other);
                    }
                    continue;
                }
                
                // B. 恒星 vs 小物体 (核心修复部分)
                // 只要我是恒星，且对方不是恒星，也不是正在飞的火箭 -> 必须吃掉
                if (this.isStar && !other.isStar) {
                    if (other.isProbe && other.fuel > 0) {
                         // 火箭飞行中无敌
                    } else {
                        this.absorb(other);
                    }
                    continue;
                }
            }

            // 引力计算 (只受恒星吸引)
            if (other.isStar) {
                // 防止极近距离引力弹射
                const safeDistSq = Math.max(distSq, 100); 
                if (dist < 1200) {
                    const force = G * other.mass / safeDistSq;
                    this.vx += (dx / dist) * force;
                    this.vy += (dy / dist) * force;
                }
            }
        }

        // --- 4. 移动与边界 ---
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < -50) this.x = canvas.width + 50;
        if (this.x > canvas.width + 50) this.x = -50;
        if (this.y < -50) this.y = canvas.height + 50;
        if (this.y > canvas.height + 50) this.y = -50;

        // --- 5. 恒星逻辑 ---
        if (this.isStar) {
            if (this.mass < 20) {
                this.downgrade();
            } else {
                this.probeTimer++;
                if (this.probeTimer > 500 && this.mass > LAUNCH_THRESHOLD) {
                    if (Math.random() < 0.2) { 
                        this.launchProbe();
                        this.probeTimer = 0;
                    }
                }
            }
        }
    }

    // --- 行为方法 ---
    updateSize() {
        this.size = Math.sqrt(this.mass); 
    }

    absorb(prey) {
        // 吃掉！
        this.mass += prey.mass;
        this.updateSize();
        // 光晕特效
        effects.push(new LightFlare(this.x, this.y, this.color, 0.5));
        
        prey.markedForDeletion = true; 
        // 强制把猎物移出屏幕，防止下一帧还没被垃圾回收时继续参与物理计算
        prey.x = -9999; 
        
        updateCounter();
    }

    damage(enemy) {
        const damage = 1.0;
        this.mass -= damage;
        enemy.mass -= damage;
        this.updateSize();
        enemy.updateSize();
        
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        this.vx += (dx/dist) * 0.05;
        this.vy += (dy/dist) * 0.05;
        
        if (Math.random() < 0.2) {
            effects.push(new ParticleExplosion((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#ffffff'));
        }
    }

    downgrade() {
        // 恒星死亡变成灰色小行星
        this.isStar = false;
        this.color = '#555'; 
        this.glow = 0;
        this.mass = 5; 
        this.size = 3;
        effects.push(new ParticleExplosion(this.x, this.y, '#aaaaaa'));
        updateCounter();
    }

    convertToDebris() {
        // 火箭失去动力变成残骸
        this.isProbe = false; // 关键：取消probe标记，让它变成普通小物体
        this.isDebris = true; // 标记为残骸（仅用于绘制三角形外观）
        this.fuel = 0;
        this.color = '#444'; 
        this.mass = 3; 
        // 保持惯性，不要急刹车
        updateCounter();
    }

    launchProbe() {
        this.mass -= 10; 
        this.updateSize();

        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#aaaaaa'; 
        probe.size = 4;
        probe.mass = 5;
        probe.fuel = 800; 
        
        const angle = Math.random() * Math.PI * 2;
        const offset = this.size + 8;
        probe.x = this.x + Math.cos(angle) * offset;
        probe.y = this.y + Math.sin(angle) * offset;

        const tangentAngle = angle + Math.PI / 2;
        const initialSpeed = 0.5; 
        
        probe.vx = this.vx + Math.cos(tangentAngle) * initialSpeed;
        probe.vy = this.vy + Math.sin(tangentAngle) * initialSpeed;

        particles.push(probe);
        effects.push(new Shockwave(probe.x, probe.y, '#ffffff', 1)); 
        updateCounter();
    }

    draw() {
        // A. 探测器 / 残骸 (三角形)
        if (this.isProbe || this.isDebris) {
            const angle = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            
            ctx.beginPath();
            ctx.moveTo(this.size * 2.5, 0); 
            ctx.lineTo(-this.size, -this.size * 0.6);
            ctx.lineTo(-this.size, this.size * 0.6);
            ctx.closePath();
            
            ctx.fillStyle = this.isProbe ? '#cccccc' : '#555555'; 
            ctx.fill();
            
            if (this.isDebris) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
            
            ctx.restore();
            return;
        }

        // B. 连线 (仅恒星)
        if (this.isStar) {
            // 省略
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

// --- 特效1：尾焰 ---
class ThrustParticle {
    constructor(x, y, parentVx, parentVy) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.decay = 0.05 + Math.random() * 0.05;
        this.size = Math.random() * 2 + 1;
        
        const speed = Math.sqrt(parentVx*parentVx + parentVy*parentVy);
        if (speed > 1.5) this.color = '#00ffff';
        else this.color = '#ffaa00';
        
        const angle = Math.atan2(parentVy, parentVx) + Math.PI; 
        const spread = (Math.random() - 0.5) * 0.8;
        const ejectSpeed = Math.random() * 1.5;
        
        this.vx = Math.cos(angle + spread) * ejectSpeed;
        this.vy = Math.sin(angle + spread) * ejectSpeed;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.size *= 0.9;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- 特效2：锐利冲击波 (发射) ---
class Shockwave {
    constructor(x, y, color, intensity = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = 20 * intensity;
        this.life = 1.0;
        this.lineWidth = 2;
    }
    update() {
        this.radius += 2; 
        this.life -= 0.05;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.lineWidth = this.lineWidth;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// --- 特效3：柔和光晕 (吞噬/融合) ---
class LightFlare {
    constructor(x, y, color, sizeMultiplier = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = 1;
        this.maxSize = 25 * sizeMultiplier;
        this.life = 1.0;
    }
    update() {
        this.size += 1.5;
        this.life -= 0.04;
    }
    draw() {
        if (this.life <= 0) return;
        ctx.globalAlpha = this.life * 0.6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- 特效4：粒子爆炸 (湮灭/死亡) ---
class ParticleExplosion {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.color = color;
        this.sparks = [];
        for(let i=0; i<8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4;
            this.sparks.push({
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                x: 0, y: 0
            });
        }
    }
    update() {
        this.life -= 0.05;
        this.sparks.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= 0.95;
            s.vy *= 0.95;
        });
    }
    draw() {
        if(this.life <= 0) return;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        this.sparks.forEach(s => {
            ctx.beginPath();
            ctx.arc(this.x + s.x, this.y + s.y, 1.5, 0, Math.PI*2);
            ctx.fill();
        });
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

    // --- 0. 蓄力光圈 ---
    if (mouse.isDown) {
        mouse.charge = Math.min(mouse.charge + 2, MAX_CHARGE); 
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, Math.sqrt(mouse.charge), 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); 
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, Math.sqrt(mouse.charge) + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`;
        ctx.stroke();
        
        const time = Date.now() / 100;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, Math.sqrt(mouse.charge) + 15 + Math.sin(time)*5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, 0.1)`;
        ctx.stroke();
    }

    // --- 1. 连线特效 ---
    const stars = particles.filter(p => p.isStar);
    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            const p1 = stars[i];
            const p2 = stars[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 15000) { 
                const dist = Math.sqrt(distSq);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - dist/122)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }

    // --- 2. 更新 ---
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