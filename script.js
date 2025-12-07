const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 宇宙常数 ---
let particles = [];
const INITIAL_ASTEROIDS = 80; // 初始小行星数量
const G = 0.4; // 引力强度 (建议 0.1 - 1.0)
const TRAIL_LENGTH = 0.3; // 拖尾长度 (0.1长 - 0.9短)

// UI 视差鼠标
const mouseUI = { x: canvas.width / 2, y: canvas.height / 2 };

// 监听鼠标移动 (仅用于 UI 视差)
window.addEventListener('mousemove', (e) => {
    mouseUI.x = e.clientX;
    mouseUI.y = e.clientY;
    
    // UI 视差
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouseUI.x - window.innerWidth / 2) * -0.015; 
        const moveY = (mouseUI.y - window.innerHeight / 2) * -0.015;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

// --- 核心玩法：点击创造恒星 ---
window.addEventListener('mousedown', (e) => {
    // 只有点击画布区域才创建(简单判断)
    // 创建一个大质量引力源
    const star = new Particle(e.clientX, e.clientY, true);
    particles.push(star);
    updateCounter();
});

function updateCounter() {
    const el = document.getElementById('particle-counter');
    if(el) el.innerText = `OBJECTS: ${particles.length.toString().padStart(3, '0')}`;
}

class Particle {
    constructor(x, y, isStar = false) {
        // 如果没传坐标，就随机生成 (用于初始小行星)
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.isStar = isStar;
        this.markedForDeletion = false;

        if (this.isStar) {
            this.mass = 100; // 恒星质量
            this.size = 5 + Math.random() * 2; // 恒星视觉大小
            this.color = '#d0f'; // 紫粉色
            this.vx = 0; // 恒星不动 (定海神针)
            this.vy = 0;
            this.glow = 15;
        } else {
            this.mass = 1; // 小行星质量
            this.size = Math.random() * 1.5 + 0.5; // 大小不一
            this.color = `rgba(100, 200, 255, ${Math.random() * 0.5 + 0.5})`; // 青蓝随机透明度
            
            // 初始随机漂浮速度 (模拟真空惯性)
            this.vx = (Math.random() - 0.5) * 0.8;
            this.vy = (Math.random() - 0.5) * 0.8;
            this.glow = 0;
        }
    }

    update(allParticles) {
        // 1. 引力计算 (N-Body 简化版)
        for (let other of allParticles) {
            if (other === this || other.markedForDeletion) continue;
            
            // 优化：只有恒星才产生强引力，小行星之间忽略 (提升性能)
            if (!other.isStar && !this.isStar) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distSq = dx*dx + dy*dy;
            const dist = Math.sqrt(distSq);

            // 碰撞吞噬检测
            if (dist < (this.size + other.size) * 0.8) {
                // 恒星吞噬小行星
                if (this.isStar && !other.isStar) {
                    this.mass += 2; // 质量增加
                    this.size += 0.1; // 视觉变大
                    if(this.size > 20) this.size = 20; // 限制最大体积
                    other.markedForDeletion = true; // 标记删除
                }
                continue;
            }

            // 引力作用范围 (避免除以0，也避免超远距离计算)
            if (dist > 10 && dist < 1000) {
                // F = G * m1 * m2 / r^2
                // a = F / m1 = G * m2 / r^2
                const force = G * other.mass / distSq;
                
                const ax = (dx / dist) * force;
                const ay = (dy / dist) * force;

                this.vx += ax;
                this.vy += ay;
            }
        }

        // 2. 运动更新
        this.x += this.vx;
        this.y += this.vy;

        // 3. 边界处理：循环宇宙 (Pac-Man 机制)
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        
        if (this.glow > 0) {
            ctx.shadowBlur = this.glow;
            ctx.shadowColor = this.color;
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0; // 重置
    }
}

// 初始化
function init() {
    particles = [];
    // 生成初始小行星
    for (let i = 0; i < INITIAL_ASTEROIDS; i++) {
        particles.push(new Particle());
    }
    updateCounter();
}

// 动画主循环
function animate() {
    // 绘制拖尾背景 (关键：这里不用 clearRect，而是盖一层半透明的黑)
    ctx.fillStyle = `rgba(2, 2, 5, ${TRAIL_LENGTH})`; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 清理被吞噬的粒子
    particles = particles.filter(p => !p.markedForDeletion);
    if(particles.some(p => p.markedForDeletion)) updateCounter();

    particles.forEach(p => {
        p.update(particles);
        p.draw();
    });

    // 自动补充小行星：如果被吃太光了，从边缘生成新的
    if (particles.length < 20) {
        particles.push(new Particle());
        updateCounter();
    }

    requestAnimationFrame(animate);
}

// 3D 卡片交互 (复用)
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