const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
let effects = []; 
const INITIAL_ASTEROIDS = 40;
const G = 0.5; 
const MAX_TRAIL = 10; 
const MIN_STAR_MASS = 30; // 坍缩阈值
const LAUNCH_THRESHOLD = 100; // 发射火箭所需的最小质量

// 恒星颜色
const STAR_COLORS = ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'];

// --- 鼠标交互 (蓄力系统) ---
const mouse = { x: 0, y: 0, isDown: false, charge: 0 };
const MAX_CHARGE = 150; // 手动蓄力最大质量 (需大于 LAUNCH_THRESHOLD)

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
    mouse.charge = 30; // 初始质量
});

window.addEventListener('mouseup', () => {
    mouse.isDown = false;
    spawnStarFromMouse();
    mouse.charge = 0;
});

function spawnStarFromMouse() {
    // 随机颜色
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    // 创建恒星
    const star = new Particle(mouse.x, mouse.y, true, color);
    // 应用蓄力质量
    star.mass = mouse.charge;
    star.updateSize(); // 根据质量重算大小
    particles.push(star);
    updateCounter();
}

function updateCounter() {
    const el = document.getElementById('particle-counter');
    const starCount = particles.filter(p => p.isStar).length;
    const probeCount = particles.filter(p => p.isProbe).length;
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
        
        // 属性初始化
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.fuel = 0; // 探测器燃料 / 恒星资源
        this.isProbe = false;

        if (this.isStar) {
            this.mass = 80; // 默认
            this.updateSize();
            this.color = color || '#ffffff';
            this.vx *= 0.1; // 恒星初始慢
            this.vy *= 0.1;
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
        // --- 1. 探测器逻辑 (小火箭) ---
        if (this.isProbe) {
            if (this.fuel > 0) {
                this.fuel--; // 消耗燃料
                
                // 加速过程 (推力)
                const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                const maxProbeSpeed = 9; // 最大速度
                if (speed < maxProbeSpeed) {
                    // 向当前方向加速
                    const angle = Math.atan2(this.vy, this.vx);
                    const thrust = 0.15; // 加速度
                    this.vx += Math.cos(angle) * thrust;
                    this.vy += Math.sin(angle) * thrust;
                }
                
                // 产生尾焰特效 (加入特效数组，不记录在history以免穿屏问题)
                if (Math.random() < 0.5) { // 降低频率优化性能
                    effects.push(new ThrustParticle(this.x, this.y, this.vx, this.vy));
                }

            } else {
                // 燃料耗尽 -> 变成死星
                this.convertToAsteroid();
            }
        }

        // --- 2. 恒星/普通粒子限速 ---
        if (this.isStar) {
            // 质量越大，阻力越大
            const maxSpeed = Math.max(0.2, 100 / this.mass); 
            const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            if (speed > maxSpeed) {
                this.vx *= 0.98;
                this.vy *= 0.98;
            }
        } else if (!this.isProbe) {
            // 普通小行星限速
            const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            if (speed > 10) {
                this.vx *= 0.95;
                this.vy *= 0.95;
            }
        }

        // --- 3. 轨迹记录 ---
        if (!this.isProbe) { // 探测器用尾焰特效，不用线条轨迹
            this.history.push({x: this.x, y: this.y});
            if (this.history.length > MAX_TRAIL) this.history.shift();
        }

        // --- 4. 物理引力与碰撞 ---
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星产生引力
            if (!other.isStar) continue;
            // 只有恒星、小行星、和没油的探测器受引力影响 (有油的探测器推力强，忽略部分干扰)
            // 这里为了物理真实，探测器还是受引力的，只是它飞得快
            
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞判定
            const minDist = (this.size + other.size) * 0.6; // 稍微宽松一点

            if (dist < minDist) {
                // A. 恒星吞噬
                if (other.isStar) { 
                    // 如果我是小行星/没油的火箭 -> 被吃
                    if (!this.isStar && !this.isProbe) {
                        other.absorb(this);
                        continue;
                    }
                    // 如果我是有油的火箭 -> 无敌，穿过 (或者反弹，这里选择穿过)
                    if (this.isProbe && this.fuel > 0) {
                        continue;
                    }
                    // 如果我是恒星 -> 融合或湮灭
                    if (this.isStar) {
                        // 简单的逻辑：大吃小，同色融合
                        if (this.color === other.color && other.mass > this.mass) {
                            // 让对方来处理吃我
                            continue; 
                        }
                        if (this.color !== other.color) {
                            this.damage(other); // 互相伤害
                        }
                    }
                }
            }

            // 引力计算
            if (dist > 10 && dist < 1200) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        // --- 5. 移动与边界 ---
        this.x += this.vx;
        this.y += this.vy;

        // 循环宇宙
        if (this.x < -50) this.x = canvas.width + 50;
        if (this.x > canvas.width + 50) this.x = -50;
        if (this.y < -50) this.y = canvas.height + 50;
        if (this.y > canvas.height + 50) this.y = -50;

        // --- 6. 恒星特有逻辑 ---
        if (this.isStar) {
            if (this.mass < MIN_STAR_MASS) {
                this.downgrade();
            } else {
                this.probeTimer++;
                // 发射逻辑：质量够大，且有足够资源(fuel在absorb时增加)
                // 降低频率 (400帧约6-7秒)
                if (this.probeTimer > 400 && this.mass > LAUNCH_THRESHOLD) {
                    if (Math.random() < 0.3) { // 30% 概率发射
                        this.launchProbe();
                        this.probeTimer = 0;
                    }
                }
            }
        }
    }

    // --- 行为方法 ---

    updateSize() {
        // 恒星大小无上限，但增长曲线变缓
        this.size = Math.sqrt(this.mass); 
    }

    absorb(prey) {
        this.mass += prey.mass;
        this.updateSize();
        // 吞噬特效
        effects.push(new Shockwave(this.x, this.y, this.color, 1));
        prey.markedForDeletion = true;
        updateCounter();
    }

    damage(enemy) {
        const damage = 1.5;
        this.mass -= damage;
        enemy.mass -= damage;
        this.updateSize();
        enemy.updateSize();
        
        // 互斥
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        this.vx += (dx/dist) * 0.1;
        this.vy += (dy/dist) * 0.1;
        
        if (Math.random() < 0.2) {
            effects.push(new Shockwave((this.x+enemy.x)/2, (this.y+enemy.y)/2, '#fff', 5));
        }
    }

    downgrade() {
        this.isStar = false;
        this.color = '#555';
        this.glow = 0;
        this.mass = 5;
        this.size = 3;
        effects.push(new Shockwave(this.x, this.y, '#fff', 10));
        updateCounter();
    }

    convertToAsteroid() {
        this.isProbe = false;
        this.color = '#888'; // 废弃金属色
        this.glow = 0;
        this.mass = 2;
        this.size = 2;
        // 减速
        this.vx *= 0.5;
        this.vy *= 0.5;
        updateCounter();
    }

    launchProbe() {
        // 消耗自身质量 (防止无限发射)
        this.mass -= 15; 
        this.updateSize();

        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#aaaaaa'; // 弹体：金属灰
        probe.size = 4; // 稍微大一点
        probe.mass = 5;
        probe.fuel = 400; // 燃料寿命 (~6秒)
        
        // 切向发射逻辑
        // 1. 获取随机角度
        const angle = Math.random() * Math.PI * 2;
        // 2. 放在恒星表面外一点，防止刚出来就判定碰撞
        const offset = this.size + 10;
        probe.x = this.x + Math.cos(angle) * offset;
        probe.y = this.y + Math.sin(angle) * offset;

        // 3. 速度：切向 (角度 + 90度)
        const tangentAngle = angle + Math.PI / 2;
        const initialSpeed = 3; // 初始速度较慢
        
        // 继承一点母星速度 + 切向发射速度
        probe.vx = this.vx + Math.cos(tangentAngle) * initialSpeed;
        probe.vy = this.vy + Math.sin(tangentAngle) * initialSpeed;

        particles.push(probe);
        effects.push(new Shockwave(probe.x, probe.y, '#fff', 5)); // 发射波
        updateCounter();
    }

    draw() {
        // --- A. 探测器 (小火箭) ---
        if (this.isProbe) {
            const angle = Math.atan2(this.vy, this.vx);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(angle);
            
            // 细长等腰三角形
            ctx.beginPath();
            ctx.moveTo(this.size * 3, 0); // 尖端更长
            ctx.lineTo(-this.size, -this.size * 0.8);
            ctx.lineTo(-this.size, this.size * 0.8);
            ctx.closePath();
            
            ctx.fillStyle = this.color; // 金属灰
            ctx.fill();
            
            // 边缘高光
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            ctx.restore();
            return;
        }

        // --- B. 轨迹连线 (Constellation Effect) ---
        if (this.history.length > 1) {
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this.history.length - 1; i++) {
                const p1 = this.history[i];
                const p2 = this.history[i+1];
                if ((p1.x - p2.x)**2 + (p1.y - p2.y)**2 < 2500) { // 50px 断裂阈值
                    if (!started) { ctx.moveTo(p1.x, p1.y); started = true; }
                    ctx.lineTo(p2.x, p2.y);
                } else {
                    started = false;
                }
            }
            const alpha = this.isStar ? 0.3 : 0.1;
            ctx.strokeStyle = this.isStar ? this.color : 'rgba(100, 200, 255, 0.1)';
            ctx.lineWidth = this.isStar ? 1 : 0.5;
            ctx.stroke();
        }

        // --- C. 星体绘制 ---
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

// --- 特效：尾焰粒子 ---
class ThrustParticle {
    constructor(x, y, parentVx, parentVy) {
        this.x = x;
        this.y = y;
        this.life = 1.0;
        this.decay = 0.05 + Math.random() * 0.05;
        this.size = Math.random() * 3 + 1; // 大小随机
        
        // 颜色：红黄渐变
        this.colorVal = Math.random(); 
        
        // 向后喷射，加一点随机散布
        const angle = Math.atan2(parentVy, parentVx) + Math.PI; // 反向
        const spread = (Math.random() - 0.5) * 0.5;
        const speed = Math.random() * 2;
        
        this.vx = Math.cos(angle + spread) * speed;
        this.vy = Math.sin(angle + spread) * speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        this.size *= 0.9;
    }

    draw() {
        ctx.globalAlpha = this.life;
        // 颜色从黄(中心)到红(边缘)
        ctx.fillStyle = this.colorVal > 0.5 ? '#ffff00' : '#ff5500';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- 特效：冲击波 ---
class Shockwave {
    constructor(x, y, color, intensity = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = 30 * intensity;
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

    // --- 0. 绘制蓄力光圈 ---
    if (mouse.isDown) {
        mouse.charge = Math.min(mouse.charge + 2, MAX_CHARGE); // 蓄力增长
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, Math.sqrt(mouse.charge), 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([5, 5]); // 虚线
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, Math.sqrt(mouse.charge) + 5 + Math.random()*2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
        ctx.stroke();
    }

    // --- 1. 连线特效 (Constellation) ---
    // 性能优化：只计算恒星之间的连线，或者距离很近的粒子
    // 为了美观，我们只画恒星之间的，或者探测器和恒星的
    // 双重循环 O(N^2) 小心性能，这里只对前100个粒子做连线
    /* 
       由于连线逻辑比较耗性能，且我们已经在 draw 轨迹里有线条了，
       这里只做简单的临近点亮，不画全图连线，保持画面整洁。
       如果非常想要连线，可以在这里加。
    */
    // 简单的临近连线
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const p1 = particles[i];
            const p2 = particles[j];
            
            // 只有恒星参与连线，或者距离极近
            if (!p1.isStar && !p2.isStar) continue; 
            
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const distSq = dx*dx + dy*dy;
            
            if (distSq < 10000) { // 100px 距离
                const dist = Math.sqrt(distSq);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(100, 200, 255, ${0.2 * (1 - dist/100)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }

    // --- 2. 更新逻辑 ---
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

// 3D 卡片
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