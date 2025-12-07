const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 300; // 增加小星星数量
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

// 随机自然生成恒星
function spawnRandomStar() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const star = new Particle(x, y, true, color);
    star.isGrowing = true; // 标记为正在生长
    star.targetMass = 50 + Math.random() * 50;
    star.mass = 5; // 初始很小
    star.updateSize();
    particles.push(star);
    // 生成特效
    effects.push(new LightFlare(x, y, color, 0.5));
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
        
        // 状态标记
        this.isProbe = false;
        this.isDebris = false; 
        this.isGrowing = false; // 是否处于出生生长阶段
        this.targetMass = 0;

        if (this.isStar) {
            this.mass = 80;
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx = 0; 
            this.vy = 0;
            this.glow = 30;
            this.probeTimer = 0;
        } else {
            // 小行星
            this.mass = 1; 
            this.size = Math.random() * 1.5 + 0.5;
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.3})`;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // --- 0. 生长逻辑 (自然生成) ---
        if (this.isGrowing) {
            if (this.mass < this.targetMass) {
                this.mass += 0.5; // 缓慢变大
                this.updateSize();
            } else {
                this.isGrowing = false;
            }
        }

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

        // --- 3. 物理互动 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞检测 (双向判定优化版)
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
                
                // B. 恒星吞噬万物
                if (this.isStar && !other.isStar) {
                    if (other.isProbe && other.fuel > 0) continue; // 活火箭无敌
                    this.absorb(other); // 吃小行星/死星/残骸
                    continue;
                }
            }

            // 引力计算 (只受恒星吸引)
            if (other.isStar && dist > 10 && dist < 1200) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
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
        if (this.isStar && !this.isGrowing) {
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
        this.mass += prey.mass;
        this.updateSize();
        effects.push(new LightFlare(this.x, this.y, this.color, 0.5));
        
        prey.markedForDeletion = true; 
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
        this.isStar = false;
        this.color = '#555'; 
        this.glow = 0;
        this.mass = 5; 
        this.size = 3;
        effects.push(new ParticleExplosion(this.x, this.y, '#aaaaaa'));
        updateCounter();
    }

    convertToDebris() {
        this.isProbe = false;
        this.isDebris = true;
        this.fuel = 0;
        this.color = '#444'; 
        this.mass = 3; 
        this.vx *= 0.6;
        this.vy *= 0.6;
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
        // 发射特效：改为火花爆炸 (您要求的)
        effects.push(new ParticleExplosion(probe.x, probe.y, '#ffffff')); 
        updateCounter();
    }

    draw() {
        // A. 探测器 / 残骸
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

        // B. 星体
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

// 辅助：颜色混合
function interpolateColor(color1, color2, factor) {
    // 简单混合，如果太复杂会影响性能
    // 这里只处理 hex 和 rgba 可能会比较麻烦
    // 为了性能和美观，我们简化逻辑：
    // 如果是小行星(蓝色)连小行星 -> 蓝色
    // 如果是小行星连恒星 -> 偏向恒星色
    // 如果是恒星连恒星 -> 白色
    return 'rgba(150, 200, 255, 0.15)'; // 默认淡蓝白
}

// --- 连线逻辑 (升级版) ---
function drawConnections() {
    // 为了性能，只检测距离 < 100 的点
    // 并且限制连线总数
    let links = 0;
    
    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        
        // 优化：每个粒子只往后检测，且只检测最近的几个
        // 在大量粒子下 O(N^2) 太慢，我们这里只对前 100 个粒子做连线
        // 或者只对恒星做全连接，小行星只连恒星
        
        // 简单暴力法 (限制距离)
        for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            
            // 距离检测
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            // 预判：如果x或y轴距离已经过大，直接跳过平方计算
            if (Math.abs(dx) > 120 || Math.abs(dy) > 120) continue;
            
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 14400) { // 120px
                const dist = Math.sqrt(distSq);
                const alpha = 1 - (dist / 120);
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                
                // 颜色逻辑：混合色
                if (p1.isStar && p2.isStar) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
                    ctx.lineWidth = 1;
                } else if (p1.isStar || p2.isStar) {
                    // 恒星连小行星
                    const starColor = p1.isStar ? p1.color : p2.color;
                    ctx.strokeStyle = starColor; // 简单直接用恒星色
                    ctx.globalAlpha = alpha * 0.2;
                    ctx.lineWidth = 0.8;
                } else {
                    // 小行星连小行星
                    ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.15})`;
                    ctx.lineWidth = 0.5;
                }
                
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                
                links++;
                if (links > 1000) return; // 熔断保护
            }
        }
    }
}


// --- 特效类 (保持不变) ---
class ThrustParticle {
    constructor(x, y, parentVx, parentVy) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.decay = 0.05 + Math.random() * 0.05;
        this.size = Math.random() * 2 + 1;
        const speed = Math.sqrt(parentVx*parentVx + parentVy*parentVy);
        if (speed > 1.5) this.color = '#00ffff'; else this.color = '#ffaa00';
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

class ParticleExplosion {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.color = color;
        this.sparks = [];
        for(let i=0; i<8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
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
            s.vx *= 0.9;
            s.vy *= 0.9;
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

    // 0. 蓄力光圈
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

    // 1. 绘制连线 (置于底部)
    drawConnections();

    // 2. 更新粒子
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

    // 自动补充小行星
    if (particles.length < 280) { // 稍微增加保留数量
        particles.push(new Particle());
    }
    
    // 随机生成恒星 (极低概率)
    if (Math.random() < 0.001) {
        spawnRandomStar();
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