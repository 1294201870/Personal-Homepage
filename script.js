const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];
const particleCount = 150; // 粒子数量

// 鼠标交互中心
const mouse = { x: null, y: null, radius: 150 };

window.addEventListener('mousemove', (event) => {
    mouse.x = event.x;
    mouse.y = event.y;
});

// 点击事件：产生冲击波 (FPS 开火)
window.addEventListener('mousedown', (event) => {
    particles.forEach(p => {
        const dx = p.x - event.x;
        const dy = p.y - event.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        // 爆炸范围
        if (distance < 400) {
            const force = (400 - distance) / 400;
            const angle = Math.atan2(dy, dx);
            // 瞬间给予巨大速度
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
    }

    update() {
        // 1. 移动
        this.x += this.vx;
        this.y += this.vy;

        // 2. 摩擦力 (模拟太空环境，速度会慢慢衰减)
        this.vx *= 0.95; 
        this.vy *= 0.95;
        
        // 保证最小速度，防止完全静止
        if (Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1) {
            // 给予微小的漂浮动力
            this.vx += (Math.random()-0.5)*0.05;
            this.vy += (Math.random()-0.5)*0.05;
        }

        // 3. 边界反弹
        if (this.x < 0 || this.x > canvas.width) {
            this.vx = -this.vx;
            this.x = Math.max(0, Math.min(canvas.width, this.x));
        }
        if (this.y < 0 || this.y > canvas.height) {
            this.vy = -this.vy;
            this.y = Math.max(0, Math.min(canvas.height, this.y));
        }

        // 4. 鼠标力场 (网球拍效果)
        // 只要鼠标靠近，就产生温和的推力
        if (mouse.x != null) {
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance < mouse.radius) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (mouse.radius - distance) / mouse.radius;
                
                const directionX = forceDirectionX * force * this.density * 0.05; // 温和推力
                const directionY = forceDirectionY * force * this.density * 0.05;
                
                this.x -= directionX;
                this.y -= directionY;
            }
        }
    }

    draw() {
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
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
        
        // 连线逻辑：距离近的粒子连线
        for (let j = i; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 120) {
                ctx.strokeStyle = `rgba(0, 255, 255, ${1 - distance/120})`;
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