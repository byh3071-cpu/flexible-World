/* player.js - 캐릭터 이동, 밀치기, HP 관리 */
(function() {
    'use strict';
    const S = window.FW.State;

    window.FW.player = {
        handlePlayerUpdate: function(snapshot, scene, type) {
            const id = snapshot.key;
            if (id === S.myId) return;
            const data = snapshot.val();
            const hp = data.hp || 100;
            if (!S.players[id]) {
                S.players[id] = scene.physics.add.sprite(data.x, data.y, 'dude');
                S.players[id].setDepth(10);
                S.players[id].setTint(data.tribeColor || data.color || 0xffffff);
                S.players[id].setCollideWorldBounds(true);
                S.players[id].setPushable(true);
                S.players[id].body.setSize(28, 32);
                S.players[id].body.setOffset(2, 0);
                S.otherPlayersGroup.add(S.players[id]);
                S.playerTexts[id] = scene.add.text(data.x, data.y - 35, data.nickname || "익명", {
                    fontSize: '12px', fill: '#fff', backgroundColor: '#00000088'
                }).setOrigin(0.5);
                S.playerHpBars[id] = scene.add.graphics();
            }
            S.players[id].x = data.x;
            S.players[id].y = data.y;
            S.playerTexts[id].x = data.x;
            S.playerTexts[id].y = data.y - 35;
            if (hp <= 0) {
                S.players[id].setTexture('skull');
                S.players[id].clearTint();
            } else {
                S.players[id].setTexture('dude');
                S.players[id].setTint(data.tribeColor || data.color || 0xffffff);
            }
            this.drawHpBar(S.playerHpBars[id], data.x, data.y - 28, hp, 100);
            if (data.chat && (type === 'change' || type === 'add')) {
                this.showChatBubble(S.playerTexts[id], data.chat, data.nickname);
            }
        },

        drawHpBar: function(g, x, y, hp, maxHp) {
            if (!g || !g.scene) return;
            g.clear();
            const w = 24, h = 4;
            g.fillStyle(0x333333, 0.8);
            g.fillRect(x - w/2, y, w, h);
            const pct = Math.max(0, Math.min(1, hp / maxHp));
            g.fillStyle(pct > 0.5 ? 0x4CAF50 : pct > 0.25 ? 0xFFC107 : 0xF44336, 0.9);
            g.fillRect(x - w/2, y, w * pct, h);
        },

        showChatBubble: function(textObj, msg, originalName) {
            if (!textObj) return;
            textObj.setText(msg);
            textObj.setStyle({ backgroundColor: '#ffffff', fill: '#000' });
            setTimeout(function() {
                if (textObj && textObj.scene) {
                    textObj.setText(originalName);
                    textObj.setStyle({ backgroundColor: '#00000088', fill: '#fff' });
                }
            }, 3000);
        }
    };
})();
