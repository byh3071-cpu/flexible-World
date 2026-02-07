/* game.js - 진입점 (Entry Point) */
import { MainScene } from './MainScene.js';
import { setStartData } from './startData.js';
import { auth } from './network.js';

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

async function startGame() {
    const name = nickInput.value.trim();
    if (name === "") {
        alert("이름을 입력해주세요!");
        return;
    }
    loginScreen.classList.add('login-fade-out');
    setTimeout(() => {
        loginScreen.style.display = 'none';
    }, 600);

    try {
        const cred = await auth.signInAnonymously();
        const uid = cred?.user?.uid;
        if (!uid) {
            throw new Error('익명 로그인 후 uid를 받지 못했습니다.');
        }
        const myColor = Phaser.Display.Color.RandomRGB(50, 255).color;
        setStartData({ myId: uid, myNickname: name, myColor });

        const config = {
            type: Phaser.AUTO,
            width: 800,
            height: 600,
            parent: 'game-container',
            backgroundColor: '#0a0a0b',
            physics: { default: 'arcade', arcade: { debug: false } },
            scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
            disableContextMenu: true,
            scene: [MainScene]
        };
        new Phaser.Game(config);
    } catch (err) {
        console.error('익명 로그인 실패:', err);
        let msg = '로그인에 실패했습니다.';
        if (err?.code === 'auth/requests-from-referer-http://127.0.0.1:5500-are-blocked' || err?.message?.includes('127.0.0.1')) {
            msg = 'Firebase에서 127.0.0.1 접속을 차단하고 있습니다.\n\n[가장 빠른 해결] 브라우저 주소창을 http://localhost:5500 으로 바꿔 접속해보세요.\n\n[또는] Firebase Console → Authentication → Settings → Authorized domains → "127.0.0.1" 추가 후 저장';
        } else if (err?.code === 'auth/operation-not-allowed') {
            msg = 'Firebase Console에서 Anonymous Auth(익명 로그인)를 활성화해주세요.';
        } else {
            msg += ' Firebase Console에서 Anonymous Auth를 활성화했는지, Authorized domains에 127.0.0.1이 있는지 확인해주세요.';
        }
        alert(msg);
        loginScreen.classList.remove('login-fade-out');
        loginScreen.style.display = 'flex';
    }
}

startBtn.addEventListener('click', startGame);
nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
});
