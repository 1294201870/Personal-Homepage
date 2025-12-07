const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙参数 ---
let particles = [];
let effects = [];
const INITIAL_ASTEROIDS = 60;
const G = 0.5; 
const MAX_TRAIL = 15;

const STAR_COLORS = ['#ff3366', '#00f0ff', '#ffcc00', '#cc00ff', '#ffffff'];

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

window.addEventListener('mousedown', (e) => {
    const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const star = new Particle(e.clientX, e.clientY, true, color);
    particles.push(star);
    updateCounter();
});

function updateCounter() {
    const el = document.getElementById('particle-counter');
    if(el) el.innerText = `OBJECTS: ${particles.length.toString().padStart(3, '0')}`;
}

class Particle {
    constructor(x, y, isStar = false, color = null) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;
        this.history = []; 
        
        if (this.isStar) {
            this.mass = 80;
            this.size = 5 + Math.random() * 3;
            this.color = color || '#ffffff';
            this.vx = (Math.random() - 0.5) * 0.2; 
            this.vy = (Math.random() - 0.5) * 0.2;
            this.glow = 25;
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
        this.history.push({x: this.x, y: this.y});
        if (this.history.length > MAX_TRAIL) this.history.shift();

        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 只有恒星有引力，能吸引别的恒星或小行星
            if (!this.isStar && !other.isStar) continue;

            // 如果我是小行星，他是小行星，且不是探测器，忽略引力(性能优化)
            if (!this.isStar && !other.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // --- 碰撞吞噬逻辑 ---
            if (dist < (this.size + other.size) * 0.8) {
                
                // 情况1: 我是恒星，对方也是恒星
                if (this.isStar && other.isStar) {
                    if (this.mass >= other.mass) {
                        // 我大，我吃他
                        this.absorb(other, true); // true 表示是恒星吞噬
                    }
                    // 如果对方比我大，这里不处理，等轮到对方 update 时吃掉我
                    continue;
                }

                // 情况2: 我是恒星，对方是小行星
                if (this.isStar && !other.isStar) {
                    this.absorb(other, false);
                    continue;
                }
            }

            // --- 引力逻辑 ---
            // 只有当距离适中时计算引力
            if (dist > 10 && dist < 1200) {
                const force = G * other.mass / distSq;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;

        if (this.isStar) {
            this.probeTimer++;
            if (this.probeTimer > 300 && Math.random() < 0.01 * (this.mass/100)) {
                this.launchProbe();
                this.probeTimer = 0;
            }
        }
    }

    // 吞噬处理
    absorb(prey, isMegaEvent) {
        // 质量守恒(部分转化)
        this.mass += prey.mass * 0.5;
        // 体积增加
        this.size = Math.min(this.size + (prey.size * 0.2), 40); 
        
        // 产生特效
        if (isMegaEvent) {
            // 恒星相撞：产生巨大冲击波
            effects.push(new Shockwave(this.x, this.y, this.color, 3)); 
            // 可能会稍微改变颜色(融合)
            // 这里简单处理：保留大恒星颜色，或者变成更亮
        } else {
            // 吃小行星：小冲击波
            effects.push(new Shockwave(this.x, this.y, this.color, 1));
        }
        
        prey.markedForDeletion = true;
    }

    launchProbe() {
        const probe = new Particle(this.x, this.y);
        probe.isProbe = true;
        probe.color = '#ffffff'; 
        const angle = Math.random() * Math.PI * 2;
        const speed = 4;
        probe.vx = Math.cos(angle) * speed + this.vx;
        probe.vy = Math.sin(angle) * speed + this.vy;
        particles.push(probe);
    }

    draw() {
        if (this.history.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.history[0].x, this.history[0].y);
            for (let i = 1; i < this.history.length; i++) {
                ctx.lineTo(this.history[i].x, this.history[i].y);
            }
            if (this.isProbe) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = this.isStar ? 
                    `rgba(${hexToRgb(this.color)}, 0.2)` : 
                    'rgba(100, 200, 255, 0.1)';
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        if (this.isStar) {
            ctx.shadowBlur = this.glow;
            ctx.shadowColor = this.color;
        } else if (this.isProbe) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Shockwave {
    constructor(x, y, color, intensity = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 1;
        this.maxRadius = 30 * intensity; // 强度决定波及范围
        this.life = 1.0; 
        this.intensity = intensity;
    }
    
    update() {
        this.radius += 1 * this.intensity; // 扩散速度
        this.life -= 0.02 * this.intensity; 
    }
    
    draw() {
        if (this.life <= 0) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${hexToRgb(this.color)}, ${this.life})`;
        ctx.lineWidth = 2 * this.intensity;
        ctx.stroke();
    }
}

function hexToRgb(hex) {
    if(hex.startsWith('#')) hex = hex.slice(1);
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r},${g},${b}`;
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
    
    // 偶尔更新计数器避免频繁操作DOM
    if(Math.random() < 0.1) updateCounter();

    requestAnimationFrame(animate);
}

document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -15; 
        const rotateY = ((x - centerX) / centerX) * 15;
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