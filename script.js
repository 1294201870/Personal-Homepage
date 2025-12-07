const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- 游戏状态 ---
let score = 0;
let isCharging = false; // 是否正在蓄力(按住鼠标)
let particles = [];
const particleCount = 120;
const enemyCount = 15; // 敌人数量

// 鼠标位置
const mouse = { x: canvas.width / 2, y: canvas.height / 2, radius: 200 };

// 更新 HUD 分数
function updateScore(points) {
    score += points;
    // 找到 HUD 中的分数显示并更新 (如果存在)
    const scoreEl = document.getElementById('score-display');
    if (scoreEl) scoreEl.innerText = `SCORE: ${score.toString().padStart(4, '0')}`;
}

// 监听鼠标
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    
    // 视差效果 (复用之前的逻辑)
    const interfaceContainer = document.querySelector('.interface');
    if (interfaceContainer) {
        const moveX = (mouse.x - window.innerWidth / 2) * -0.02;
        const moveY = (mouse.y - window.innerHeight / 2) * -0.02;
        interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
});

// 按下鼠标：开启黑洞引力
window.addEventListener('mousedown', () => {
    isCharging = true;
    document.body.style.cursor = 'none'; // 隐藏光标，沉浸感
});

// 松开鼠标：释放冲击波
window.addEventListener('mouseup', () => {
    isCharging = false;
    document.body.style.cursor = 'crosshair';
    
    // 产生爆炸冲击
    particles.forEach(p => {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // 只有在引力范围内的粒子才会被炸飞
        if (dist < 300) {
            const force = (300 - dist) / 300;
            const angle = Math.atan2(dy, dx);
            const blastPower = 40; // 爆炸力度
            
            p.vx += Math.cos(angle) * force * blastPower;
            p.vy += Math.sin(angle) * force * blastPower;
            
            // 如果炸到的是敌人，直接消灭
            if (p.type === 'enemy') {
                p.reset(); // 重置敌人位置
                updateScore(100); // 加分
                createExplosion(p.x, p.y); // 播放击杀特效(预留函数)
            }
        }
    });
});

class Particle {
    constructor(type = 'friendly') {
        this.type = type; // 'friendly' | 'enemy'
        this.reset();
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.size = Math.random() * 2 + 1;
        
        if (this.type === 'enemy') {
            this.color = '#ff0055'; // 红色病毒
            this.size = 3;
            this.speedMult = 1.5;
        } else {
            this.color = '#00ffff'; // 青色数据
            this.speedMult = 1;
        }
    }

    update() {
        // 1. 基础移动
        this.x += this.vx * this.speedMult;
        this.y += this.vy * this.speedMult;

        // 2. 摩擦力 (让爆炸后的速度慢慢停下来)
        this.vx *= 0.95;
        this.vy *= 0.95;

        // 3. 交互逻辑
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (isCharging) {
            // --- 黑洞模式：吸入 ---
            if (dist < 500) { // 吸入范围
                const force = (500 - dist) / 500;
                const angle = Math.atan2(dy, dx);
                const attractionSpeed = 2; 
                
                this.vx += Math.cos(angle) * force * attractionSpeed;
                this.vy += Math.sin(angle) * force * attractionSpeed;
                
                // 靠近中心时旋转
                this.vx += -Math.sin(angle) * 1;
                this.vy += Math.cos(angle) * 1;
            }
        } else {
            // --- 普通模式：排斥 (网球拍) ---
            if (dist < 150) {
                const force = (150 - dist) / 150;
                const angle = Math.atan2(dy, dx);
                const repelSpeed = 0.5;
                
                this.vx -= Math.cos(angle) * force * repelSpeed;
                this.vy -= Math.sin(angle) * force * repelSpeed;
            }
        }

        // 4. 边界检测
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            // 敌人跑出屏幕就重置，友军反弹
            if (this.type === 'enemy') {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
            } else {
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        // 蓄力时粒子颤抖
        const jitter = isCharging ? (Math.random() - 0.5) * 2 : 0;
        ctx.arc(this.x + jitter, this.y + jitter, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 初始化粒子
function init() {
    particles = [];
    // 生成友军
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle('friendly'));
    }
    // 生成敌人
    for (let i = 0; i < enemyCount; i++) {
        particles.push(new Particle('enemy'));
    }
}

// 动画循环
function animate() {
    // 拖尾效果 (用半透明黑色覆盖上一帧)
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(p => {
        p.update();
        p.draw();
    });

    // 绘制黑洞中心
    if (isCharging) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 10 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
        ctx.fill();
    }

    requestAnimationFrame(animate);
}

// 简单的爆炸特效 (击杀反馈)
function createExplosion(x, y) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
}

// 3D卡片逻辑 (保持不变)
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