const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];
const particleCount = 150;

// 鼠标位置
const mouse = { x: canvas.width / 2, y: canvas.height / 2, radius: 150 };

// --- 3D 交互逻辑开始 ---

// 1. 全局视差效果 (UI 整体跟随鼠标反向微动)
const interfaceContainer = document.querySelector('.interface');
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;

    // 计算中心点偏移量
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // UI 层移动幅度 (越小越微妙)
    const moveX = (mouse.x - centerX) * -0.02;
    const moveY = (mouse.y - centerY) * -0.02;

    interfaceContainer.style.transform = `translate(${moveX}px, ${moveY}px)`;
});

// 2. 卡片 3D 倾斜效果
document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left; // 鼠标在卡片内的 X
        const y = e.clientY - rect.top;  // 鼠标在卡片内的 Y
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // 计算旋转角度 (限制最大角度为 15 度)
        const rotateX = ((y - centerY) / centerY) * -15; 
        const rotateY = ((x - centerX) / centerX) * 15;

        // 应用 3D 变换
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
        card.style.borderColor = '#f0f'; // 激活时变色
        card.style.boxShadow = '0 0 30px rgba(255, 0, 255, 0.4)';
    });

    card.addEventListener('mouseleave', () => {
        // 复原
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        card.style.borderColor = '#0ff';
        card.style.boxShadow = '0 0 5px #0ff';
    });
});

// --- 3D 交互逻辑结束 ---

// --- 原有粒子系统逻辑 (保持 FPS 物理特性) ---
window.addEventListener('mousedown', (event) => {
    particles.forEach(p => {
        const dx = p.x - event.clientX;
        const dy = p.y - event.clientY;
        const distance = Math.sqrt(dx*dx + dy*dy);
        if (distance < 400) {
            const force = (400 - distance) / 400;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force * 30; 
            p.vy += Math.sin(angle) * force * 30;
        }
    });
});

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = (Math.random() - 0.5) * 1.5;
        this.size = Math.random() * 2 + 1;
        this.density = (Math.random() * 30) + 1;
        // 增加 z 轴模拟 (大小变化)
        this.z = Math.random() * 2 + 0.5; 
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95; 
        this.vy *= 0.95;

        // 最小漂浮速度
        if (Math.abs(this.vx) < 0.1) this.vx += (Math.random()-0.5)*0.05;
        if (Math.abs(this.vy) < 0.1) this.vy += (Math.random()-0.5)*0.05;

        // 边界处理
        if (this.x < 0 || this.x > canvas.width) this.vx = -this.vx;
        if (this.y < 0 || this.y > canvas.height) this.vy = -this.vy;

        // 鼠标排斥
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx*dx + dy*dy);
        if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            this.x -= Math.cos(angle) * force * 2;
            this.y -= Math.sin(angle) * force * 2;
        }
    }

    draw() {
        // 根据 "深度" 改变透明度和大小
        ctx.globalAlpha = this.z / 3; 
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        // 远的粒子画小一点，近的画大一点
        ctx.arc(this.x, this.y, this.size * this.z, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function init() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        for (let j = i; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 120) {
                // 连线透明度也受 Z 轴影响
                ctx.strokeStyle = `rgba(0, 255, 255, ${(1 - distance/120) * 0.5})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animate);
}

init();
animate();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});