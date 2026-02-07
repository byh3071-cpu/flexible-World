/* game.js - 진입점 (Entry Point) */
import { MainScene } from './MainScene.js';
import { setStartData } from './startData.js';

const loginScreen = document.getElementById('login-screen');
const nickInput = document.getElementById('nickname-input');
const startBtn = document.getElementById('start-btn');

function bindRightClick() {
    const blockOpt = { passive: false, capture: true };
    let rightButtonDown = false;
    const blockRight = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    };
    const bind = (el) => {
        if (!el) return;
        el.addEventListener('contextmenu', (e) => blockRight(e), true);
        el.addEventListener('auxclick', (e) => blockRight(e), true);
        el.addEventListener('mousedown', (e) => {
            if (e.button === 2) { rightButtonDown = true; blockRight(e); }
        }, true);
        el.addEventListener('mouseup', (e) => {
            if (e.button === 2) { rightButtonDown = false; blockRight(e); }
        }, true);
        el.addEventListener('mousemove', (e) => {
            if (rightButtonDown || (e.buttons & 2)) blockRight(e);
        }, blockOpt);
        el.addEventListener('pointerdown', (e) => {
            if (e.button === 2) { rightButtonDown = true; blockRight(e); }
        }, blockOpt);
        el.addEventListener('pointerup', (e) => {
            if (e.button === 2) { rightButtonDown = false; blockRight(e); }
        }, blockOpt);
        el.addEventListener('pointermove', (e) => {
            if (rightButtonDown || (e.buttons & 2)) blockRight(e);
        }, blockOpt);
        el.addEventListener('wheel', (e) => blockRight(e), blockOpt);
        el.addEventListener('touchmove', (e) => blockRight(e), blockOpt);
    };
    bind(window);
    bind(document);
    bind(document.documentElement);
    bind(document.body);
    document.addEventListener('keydown', (e) => {
        if (e.altKey && ['Home', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
        if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) e.preventDefault();
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) e.preventDefault();
        if (e.ctrlKey && e.key === 'Tab') e.preventDefault();
    });
}
bindRightClick();

function startGame() {
    const name = nickInput.value.trim();
    if (name === "") {
        alert("이름을 입력해주세요!");
        return;
    }
    loginScreen.classList.add('login-fade-out');
    setTimeout(() => {
        loginScreen.style.display = 'none';
    }, 600);

    const myId = 'user_' + Math.floor(Math.random() * 1000000);
    const myColor = Phaser.Display.Color.RandomRGB(50, 255).color;
    setStartData({ myId, myNickname: name, myColor });

    const config = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'game-container',
        backgroundColor: '#0a0a0b',
        physics: { default: 'arcade', arcade: { debug: false } },
        disableContextMenu: true,
        scene: [MainScene]
    };
    new Phaser.Game(config);
}

startBtn.addEventListener('click', startGame);
nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
});
