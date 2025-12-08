const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ==========================================
// --- 🚀 全局配置中心 (调试参数请改这里) ---
// ==========================================
const CONFIG = {
    // --- 🌌 宇宙物理 ---
    G: 0.5,                       // 引力常数 (影响引力强弱)
    FRICTION: 0.95,               // 阻力系数 (速度过快时的减速比例)
    INITIAL_ASTEROIDS: 80,        // 初始小行星数量
    MIN_PARTICLE_COUNT: 100,       // 维持的最少粒子数 (低于此值自动补充)
    
    // --- ☀️ 恒星 (Star) ---
    STAR: {
        COLORS: ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'],
        INIT_MASS: 80,            // 默认恒星质量
        MIN_MASS: 20,             // 坍缩阈值 (低于此质量变死星)
        MAX_CHARGE_MASS: 200,     // 鼠标长按产生的最大质量
        CHARGE_SPEED: 2,          // 鼠标蓄力速度
        LAUNCH_THRESHOLD: 120,    // 发射火箭所需的最小质量
        LAUNCH_COST: 10,          // 发射一次消耗的质量
        LAUNCH_COOLDOWN: 500,     // 发射冷却 (帧数)
        LAUNCH_CHANCE: 0.2,       // 冷却好后每帧发射的概率 (0-1)
        SPAWN_CHANCE: 0.001,      // 自然随机生成恒星的概率
        SPEED_LIMIT: 0.5,         // 恒星最大漂移速度 (越小越稳)
    },

    // --- 🚀 探测器/火箭 (Probe) ---
    PROBE: {
        FUEL: 800,                // 燃料寿命 (帧数)
        MASS: 5,                  // 质量
        SIZE: 4,                  // 大小
        MAX_SPEED: 1.8,           // 最大巡航速度
        THRUST: 0.05,             // 推进力加速度
        COLOR_ACTIVE: '#aaaaaa',  // 有燃料时的颜色
        COLOR_DEAD: '#444444',    // 没燃料时的颜色(残骸)
    },

    // --- 🌑 小行星/环境 (Asteroid) ---
    ASTEROID: {
        MASS: 1,                  // 基础质量
        MIN_SIZE: 0.5,            // 最小随机大小
        MAX_SIZE: 1.5,            // 最大随机大小
        MAX_SPEED: 2.0,           // 最大速度限制
        COLOR_PREFIX: 'rgba(100, 200, 255,', // 颜色前缀
    },

    // --- 🔗 连线特效 (Connections) ---
    CONNECTION: {
        MAX_DISTANCE: 120,        // 最大连线距离
        OPACITY: 0.3,            // 连线基础透明度
    }
};

// 预计算距离平方 (优化性能)
const MAX_CONN_DIST_SQ = CONFIG.CONNECTION.MAX_DISTANCE * CONFIG.CONNECTION.MAX_DISTANCE;


// --- 鼠标交互 ---
const mouse = { x: 0, y: 0, isDown: false, charge: 30 };

let particles = [];
let effects = [];

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // UI 视差
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouse.x - window.innerWidth / 2) * -0.01; 
        const moveY = (mouse.y - window.innerHeight / 2) * -0.01;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

window.addEventListener('mousedown', () => {
    mouse.isDown = true;
    mouse.charge = 30; // 重置初始蓄力
});

window.addEventListener('mouseup', () => {
    if (mouse.isDown) {
        spawnStarFromMouse();
        mouse.isDown = false;
    }
});

// 手动生成
function spawnStarFromMouse() {
    const color = CONFIG.STAR.COLORS[Math.floor(Math.random() * CONFIG.STAR.COLORS.length)];
    const star = new Particle(mouse.x, mouse.y, true, color);
    star.mass = mouse.charge;
    star.updateSize();
    particles.push(star);
    updateCounter();
}

// 自然生成
function spawnRandomStar() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const color = CONFIG.STAR.COLORS[Math.floor(Math.random() * CONFIG.STAR.COLORS.length)];
    const star = new Particle(x, y, true, color);
    star.isGrowing = true; 
    star.targetMass = 50 + Math.random() * 50;
    star.mass = 5; 
    star.updateSize();
    particles.push(star);
    effects.push(new LightFlare(x, y, color, 0.5));
    updateCounter();
}

function updateCounter() {
    const el = document.getElementById('particle-counter');
    const starCount = particles.filter(p => p.isStar).length;
    const probeCount = particles.filter(p => p.isProbe && p.fuel > 0).length;
    if(el) el.innerText = `STARS: ${starCount} // PROBES: ${probeCount} // TOTAL: ${particles.length}`;
}

// ==========================================
// --- 粒子核心类 ---
// ==========================================
class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = [];
        
        // 初始速度
        this.vx = (Math.random() - 0.5) * 0.5; 
        this.vy = (Math.random() - 0.5) * 0.5;
        this.fuel = 0;
        
        // 状态标记
        this.isProbe = false;
        this.isDebris = false; 
        this.isGrowing = false; 
        this.targetMass = 0;

        if (this.isStar) {
            this.mass = CONFIG.STAR.INIT_MASS;
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx = 0; 
            this.vy = 0;
            this.glow = 30;
            this.probeTimer = 0;
        } else {
            // 小行星初始设定
            this.mass = CONFIG.ASTEROID.MASS;
            this.size = Math.random() * (CONFIG.ASTEROID.MAX_SIZE - CONFIG.ASTEROID.MIN_SIZE) + CONFIG.ASTEROID.MIN_SIZE;
            this.color = `${CONFIG.ASTEROID.COLOR_PREFIX}${Math.random() * 0.5 + 0.3})`;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // --- 0. 生长逻辑 ---
        if (this.isGrowing) {
            if (this.mass < this.targetMass) {
                this.mass += 0.5; 
                this.updateSize();
            } else {
                this.isGrowing = false;
            }
        }

        // --- 1. 探测器动力学 ---
        if (this.isProbe) {
            if (this.fuel > 0) {
                this.fuel--; 
                
                // 缓慢加速
                const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                if (speed < CONFIG.PROBE.MAX_SPEED) {
                    const angle = Math.atan2(this.vy, this.vx);
                    this.vx += Math.cos(angle) * CONFIG.PROBE.THRUST;
                    this.vy += Math.sin(angle) * CONFIG.PROBE.THRUST;
                }
                
                // 尾焰
                if (Math.random() < 0.4) {
                    effects.push(new ThrustParticle(this.x, this.y, this.vx, this.vy));
                }
            } else {
                this.convertToDebris();
            }
        }

        // --- 2. 速度阻力限制 ---
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        // 不同物体的限速逻辑
        let limit = CONFIG.ASTEROID.MAX_SPEED;
        if (this.isStar) limit = CONFIG.STAR.SPEED_LIMIT;
        if (this.isProbe && this.fuel > 0) limit = 5; // 活火箭略快

        if (speed > limit) {
            this.vx *= CONFIG.FRICTION;
            this.vy *= CONFIG.FRICTION;
        }

        // --- 3. 物理互动 (N-Body & Collision) ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 优化：计算距离平方
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;

            // 只有恒星产生引力场和碰撞判定核心
            if (!other.isStar && !this.isStar) continue;

            // 碰撞判定半径
            const minDist = (this.size + other.size) * 0.8;
            const minDistSq = minDist * minDist;

            if (distSq < minDistSq) {
                // A. 恒星 vs 恒星
                if (this.isStar && other.isStar) {
                    if (this.color === other.color) {
                        if (this.mass >= other.mass) this.absorb(other); 
                    } else {
                        this.damage(other);
                    }
                    continue;
                }
                
                // B. 恒星吞噬小物体 (修复：只要对方不是恒星，且不是活火箭，就吃)
                if (this.isStar && !other.isStar) {
                    if (other.isProbe && other.fuel > 0) continue; // 活火箭无敌
                    this.absorb(other);
                    continue;
                }
            }

            // 引力计算 (只受恒星吸引)
            // 距离限制：太近不计(防弹射)，太远不计
            if (other.isStar && distSq > 100 && distSq < 1440000) { 
                const dist = Math.sqrt(distSq);
                const force = CONFIG.G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // --- 4. 移动与循环边界 ---
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < -50) this.x = canvas.width + 50;
        if (this.x > canvas.width + 50) this.x = -50;
        if (this.y < -50) this.y = canvas.height + 50;
        if (this.y > canvas.height + 50) this.y = -50;

        // --- 5. 恒星特有逻辑 ---
        if (this.isStar && !this.isGrowing) {
            // 坍缩检查
            if (this.mass < CONFIG.STAR.MIN_MASS) {
                this.downgrade();
            } else {
                // 发射火箭逻辑
                this.probeTimer++;
                if (this.probeTimer > CONFIG.STAR.LAUNCH_COOLDOWN && this.mass > CONFIG.STAR.LAUNCH_THRESHOLD) {
                    if (Math.random() < CONFIG.STAR.LAUNCH_CHANCE) { 
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
        prey.x = -9999; // 移出屏幕防止二次计算
        updateCounter();
    }

    damage(enemy) {
        const damage = 1.0;
        this.mass -= damage;
        enemy.mass -= damage;
        this.updateSize();
        enemy.updateSize();
        
        // 互斥弹开
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
        this.color = CONFIG.PROBE.COLOR_DEAD; 
        this.mass = 3; 
        // 关键：保留部分速度，不要归零
        this.vx *= 0.8;
        this.vy *= 0.8;
        updateCounter();
    }

    launchProbe() {
        this.mass -= CONFIG.STAR.LAUNCH_COST; 
        this.updateSize();

        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = CONFIG.PROBE.COLOR_ACTIVE; 
        probe.size = CONFIG.PROBE.SIZE;
        probe.mass = CONFIG.PROBE.MASS;
        probe.fuel = CONFIG.PROBE.FUEL; 
        
        // 切向发射位置
        const angle = Math.random() * Math.PI * 2;
        const offset = this.size + 8;
        probe.x = this.x + Math.cos(angle) * offset;
        probe.y = this.y + Math.sin(angle) * offset;

        // 切向发射速度
        const tangentAngle = angle + Math.PI / 2;
        const initialSpeed = 0.5; 
        
        probe.vx = this.vx + Math.cos(tangentAngle) * initialSpeed;
        probe.vy = this.vy + Math.sin(tangentAngle) * initialSpeed;

        particles.push(probe);
        effects.push(new ParticleExplosion(probe.x, probe.y, '#ffffff')); 
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

// --- 连线逻辑 ---
function drawConnections() {
    let links = 0;
    const maxLinks = 1000; // 性能熔断
    
    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        
        // 性能优化：内层循环只往后找
        for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j];
            
            // 粗略筛选：轴距过大直接跳过
            const dx = p1.x - p2.x;
            if (dx > CONFIG.CONNECTION.MAX_DISTANCE || dx < -CONFIG.CONNECTION.MAX_DISTANCE) continue;
            const dy = p1.y - p2.y;
            if (dy > CONFIG.CONNECTION.MAX_DISTANCE || dy < -CONFIG.CONNECTION.MAX_DISTANCE) continue;

            const distSq = dx*dx + dy*dy;
            
            if (distSq < MAX_CONN_DIST_SQ) { 
                const dist = Math.sqrt(distSq);
                const alpha = 1 - (dist / CONFIG.CONNECTION.MAX_DISTANCE);
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                
                // 颜色逻辑
                if (p1.isStar && p2.isStar) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
                    ctx.lineWidth = 0.8;
                } else if (p1.isStar || p2.isStar) {
                    const starColor = p1.isStar ? p1.color : p2.color;
                    ctx.strokeStyle = starColor; 
                    ctx.globalAlpha = alpha * 0.2;
                    ctx.lineWidth = 0.5;
                } else {
                    ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * CONFIG.CONNECTION.OPACITY})`;
                    ctx.lineWidth = 0.3;
                }
                
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                
                links++;
                if (links > maxLinks) return;
            }
        }
    }
}

// --- 特效类 ---
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

// --- 主循环 ---
function init() {
    particles = [];
    effects = [];
    for (let i = 0; i < CONFIG.INITIAL_ASTEROIDS; i++) {
        particles.push(new Particle());
    }
    updateCounter();
}

function animate() {
    ctx.fillStyle = 'rgba(2, 2, 5, 0.4)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 0. 蓄力光圈
    if (mouse.isDown) {
        mouse.charge = Math.min(mouse.charge + CONFIG.STAR.CHARGE_SPEED, CONFIG.STAR.MAX_CHARGE_MASS); 
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

    // 1. 连线 (底层)
    drawConnections();

    // 2. 粒子更新
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

    // 3. 自动补充
    if (particles.length < CONFIG.MIN_PARTICLE_COUNT) {
        particles.push(new Particle());
    }
    
    // 4. 随机自然生成恒星
    if (Math.random() < CONFIG.STAR.SPAWN_CHANCE) {
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