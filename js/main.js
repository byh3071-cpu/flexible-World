/* main.js - 게임 시작 및 초기화 */
(function() {
    'use strict';

    var db = window.FW.db;
    window.FW.State = {
        myId: null, myNickname: null, myColor: null, currentMaterial: 'wall',
        game: null, myPlayer: null, marker: null,
        keyW: null, keyA: null, keyS: null, keyD: null, shiftKey: null, keySpace: null, keyE: null,
        key1: null, key2: null, key3: null, key4: null, key5: null, key6: null,
        lastDir: { x: 0, y: 0 },
        players: {}, playerTexts: {}, playerHpBars: {},
        blocks: {}, doorKeys: new Set(), doorOpenUntil: {},
        myHp: 100, myStone: 0, myWood: 0, gatherProgress: {},
        totemsData: {}, myTribeId: null, myTribeColor: null,
        floorGroup: null, wallGroup: null, signGroup: null, doorGroup: null,
        resourceGroup: null, dropGroup: null, totemGroup: null, otherPlayersGroup: null
    };
    var S = window.FW.State;

    function bindRightClick() {
        var blockOpt = { passive: false, capture: true };
        var rightButtonDown = false;
        var blockRight = function(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return false; };
        var onContext = function(e) { blockRight(e); return false; };
        var onMouseDown = function(e) { if (e.button === 2) { rightButtonDown = true; blockRight(e); } };
        var onMouseUp = function(e) { if (e.button === 2) { rightButtonDown = false; blockRight(e); } };
        var onMouseMove = function(e) { if (rightButtonDown || (e.buttons & 2)) blockRight(e); };
        var onPointerDown = function(e) { if (e.button === 2) { rightButtonDown = true; blockRight(e); } };
        var onPointerUp = function(e) { if (e.button === 2) { rightButtonDown = false; blockRight(e); } };
        var onPointerMove = function(e) { if (rightButtonDown || (e.buttons & 2)) blockRight(e); };
        var bind = function(el) {
            if (!el) return;
            el.addEventListener('contextmenu', onContext, true);
            el.addEventListener('auxclick', onContext, true);
            el.addEventListener('mousedown', onMouseDown, true);
            el.addEventListener('mouseup', onMouseUp, true);
            el.addEventListener('mousemove', onMouseMove, blockOpt);
            el.addEventListener('pointerdown', onPointerDown, blockOpt);
            el.addEventListener('pointerup', onPointerUp, blockOpt);
            el.addEventListener('pointermove', onPointerMove, blockOpt);
            el.addEventListener('pointercancel', blockRight, blockOpt);
            el.addEventListener('pointerleave', onPointerUp, blockOpt);
            el.addEventListener('wheel', function(e) { blockRight(e); }, blockOpt);
            el.addEventListener('touchmove', function(e) { blockRight(e); }, blockOpt);
            ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(name) { el.addEventListener(name, blockRight, blockOpt); });
        };
        bind(window); bind(document); bind(document.documentElement); bind(document.body);
        document.addEventListener('keydown', function(e) {
            if (e.altKey && (e.key === 'Home' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.preventDefault();
            if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) e.preventDefault();
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) e.preventDefault();
            if (e.ctrlKey && e.key === 'Tab') e.preventDefault();
        });
    }
    bindRightClick();

    function preload() {
        this.load.image('dude', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        var g = this.make.graphics({ x: 0, y: 0 });
        g.fillStyle(0x888888); g.fillRect(0, 0, 32, 32); g.lineStyle(2, 0x555555); g.strokeRect(0, 0, 32, 32); g.generateTexture('wall', 32, 32);
        g.clear(); g.fillStyle(0x4CAF50); g.fillRect(0, 0, 32, 32); g.fillStyle(0x388E3C); g.fillCircle(10, 10, 2); g.fillCircle(25, 25, 3); g.generateTexture('grass', 32, 32);
        g.clear(); g.fillStyle(0x2196F3); g.fillRect(0, 0, 32, 32); g.generateTexture('water', 32, 32);
        g.clear(); g.fillStyle(0x8D6E63); g.fillRect(4, 4, 24, 20); g.fillStyle(0x5D4037); g.fillRect(14, 24, 4, 8); g.fillStyle(0xFFFFFF); g.fillRect(8, 10, 16, 2); g.fillRect(8, 16, 12, 2); g.generateTexture('sign', 32, 32);
        g.clear(); g.fillStyle(0x6D4C41); g.fillRect(0, 0, 32, 32); g.fillStyle(0x5D4037); g.fillRect(4, 4, 24, 24); g.fillStyle(0x4E342E); g.fillRect(12, 8, 8, 12); g.fillStyle(0xBCAAA4); g.fillRect(14, 10, 4, 4); g.lineStyle(2, 0x3E2723); g.strokeRect(4, 4, 24, 24); g.generateTexture('door', 32, 32);
        g.clear(); g.fillStyle(0xFFFFFF); g.fillCircle(16, 12, 10); g.fillStyle(0x111111); g.fillCircle(12, 10, 2); g.fillCircle(20, 10, 2); g.fillRect(10, 18, 12, 4); g.generateTexture('skull', 32, 32);
        g.clear(); g.fillStyle(0x6D6D6D); g.fillCircle(16, 18, 12); g.fillStyle(0x555555); g.fillCircle(12, 16, 4); g.fillCircle(20, 18, 3); g.lineStyle(2, 0x444444); g.strokeCircle(16, 18, 12); g.generateTexture('rock', 32, 32);
        g.clear(); g.fillStyle(0x5D4037); g.fillRect(14, 16, 4, 16); g.fillStyle(0x388E3C); g.fillCircle(16, 12, 10); g.fillStyle(0x2E7D32); g.fillCircle(12, 14, 4); g.fillCircle(20, 12, 4); g.generateTexture('tree', 32, 32);
        g.clear(); g.fillStyle(0x8D6E63, 0.8); g.fillRect(8, 12, 16, 8); g.fillStyle(0xFFFFFF); g.fillRect(10, 14, 4, 4); g.fillRect(18, 14, 4, 4); g.generateTexture('drop', 32, 32);
        g.clear(); g.fillStyle(0xFFD700); g.fillRect(8, 8, 16, 20); g.fillStyle(0xFFA500); g.fillRect(10, 10, 12, 16); g.fillStyle(0xFFD700); g.fillCircle(16, 6, 6); g.lineStyle(2, 0xB8860B); g.strokeRect(8, 8, 16, 20); g.generateTexture('totem', 32, 32);
    }

    function create() {
        var self = this;
        db.ref(".info/connected").on("value", function(snap) {
            var status = document.getElementById('status');
            if (snap.val()) { status.innerText = "연결됨"; status.style.color = "#00ff00"; }
            else { status.innerText = "끊김"; status.style.color = "red"; }
        });

        this.input.mouse.disableContextMenu();
        S.floorGroup = this.add.group();
        S.wallGroup = this.physics.add.staticGroup();
        S.signGroup = this.physics.add.staticGroup();
        S.doorGroup = this.physics.add.staticGroup();
        S.resourceGroup = this.physics.add.staticGroup();
        S.dropGroup = this.add.group();
        S.totemGroup = this.physics.add.staticGroup();
        S.otherPlayersGroup = this.physics.add.group();

        var startX = Math.floor(Math.random() * 20) * 32 + 16;
        var startY = Math.floor(Math.random() * 15) * 32 + 16;
        S.myPlayer = this.physics.add.sprite(startX, startY, 'dude');
        S.myPlayer.setTint(S.myColor);
        S.myPlayer.setCollideWorldBounds(true);
        S.myPlayer.body.setSize(28, 32);
        S.myPlayer.body.setOffset(2, 0);
        S.myPlayer.setPushable(false);
        S.myPlayer.setDepth(10);

        S.marker = this.add.graphics();
        S.marker.lineStyle(2, 0xffffff, 1);
        S.marker.strokeRect(0, 0, 32, 32);
        S.marker.setDepth(100);

        this.myHpBar = this.add.graphics().setDepth(11);
        this.myText = this.add.text(startX, startY - 35, S.myNickname, {
            fontSize: '12px', fill: '#fff', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
        }).setOrigin(0.5).setDepth(11);

        this.physics.add.collider(S.myPlayer, S.wallGroup);
        this.physics.add.collider(S.myPlayer, S.signGroup);
        this.physics.add.collider(S.myPlayer, S.doorGroup);
        this.physics.add.collider(S.myPlayer, S.resourceGroup);
        this.physics.add.collider(S.myPlayer, S.totemGroup);
        this.physics.add.collider(S.myPlayer, S.otherPlayersGroup);

        S.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        S.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        S.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        S.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        S.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        S.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        S.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        S.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
        S.key4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
        S.key5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
        S.key6 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);
        S.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        S.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        db.ref('players/' + S.myId).set({ x: startX, y: startY, nickname: S.myNickname, color: S.myColor, hp: 100, stone: 0, wood: 0, tribeId: null, tribeColor: null });

        window.FW.map.maybeSpawnResources();
        this.time.addEvent({ delay: 15000, loop: true, callback: window.FW.map.maybeSpawnResources });

        var TERRITORY_RADIUS = 20 * 32;
        var getTotemAt = function(gx, gy) {
            for (var k in S.totemsData) {
                var t = S.totemsData[k];
                if (!t) continue;
                var d = Math.sqrt((gx - t.x) * (gx - t.x) + (gy - t.y) * (gy - t.y));
                if (d <= TERRITORY_RADIUS) return { key: k, ownerId: t.ownerId, color: t.color };
            }
            return null;
        };
        var isOwnerOrCitizenOf = function(totem) {
            return totem.ownerId === S.myId || (S.myTribeId === totem.key);
        };

        var canvasEl = this.sys.game.canvas;
        var gameContainer = document.getElementById('game-container');

        var doBuildOrDelete = function(e) {
            if (e.button !== 0) return;
            if (!gameContainer.contains(e.target)) return;
            var rect = canvasEl.getBoundingClientRect();
            var scaleX = canvasEl.width / rect.width;
            var scaleY = canvasEl.height / rect.height;
            var x = (e.clientX - rect.left) * scaleX;
            var y = (e.clientY - rect.top) * scaleY;
            var gridX = Math.floor(x / 32) * 32 + 16;
            var gridY = Math.floor(y / 32) * 32 + 16;
            var blockKey = gridX + '_' + gridY;

            var isShift = e.shiftKey || S.shiftKey.isDown;
            if (isShift) {
                var totem = getTotemAt(gridX, gridY);
                if (totem && !isOwnerOrCitizenOf(totem)) {
                    alert("이 영토에서 건설/파괴할 권한이 없습니다.");
                    return;
                }
                db.ref('blocks/' + blockKey).remove();
                return;
            }

            for (var id in S.players) {
                if (id === S.myId) continue;
                var p = S.players[id];
                if (p && p.active && Phaser.Math.Distance.Between(x, y, p.x, p.y) < 30) {
                    (function(pid) {
                        db.ref('players/' + pid).once('value', function(snap) {
                            var d = snap.val();
                            if (S.myTribeId && d && d.tribeId === S.myTribeId) return;
                            var newHp = Math.max(0, (d.hp || 100) - 20);
                            if (newHp <= 0) {
                                var rx = Math.floor(Math.random() * 20) * 32 + 16;
                                var ry = Math.floor(Math.random() * 15) * 32 + 16;
                                var s = Math.floor((d.stone || 0) * 0.5);
                                var w = Math.floor((d.wood || 0) * 0.5);
                                db.ref('players/' + pid).update({ x: rx, y: ry, hp: 100, stone: (d.stone || 0) - s, wood: (d.wood || 0) - w });
                                if (s > 0 || w > 0) {
                                    var gx = Math.floor(d.x / 32) * 32 + 16;
                                    var gy = Math.floor(d.y / 32) * 32 + 16;
                                    db.ref('blocks/' + gx + '_' + gy).set({ x: gx, y: gy, type: 'drop', stone: s, wood: w });
                                }
                            } else {
                                db.ref('players/' + pid).update({ hp: newHp });
                            }
                        });
                    })(id);
                    return;
                }
            }

            var totemAt = null;
            var tk = null;
            for (var k in S.totemsData) {
                var t = S.totemsData[k];
                if (t && Phaser.Math.Distance.Between(gridX, gridY, t.x, t.y) < 24) {
                    totemAt = t; tk = k; break;
                }
            }
            if (totemAt && tk) {
                if (S.myTribeId === tk) { }
                else if (totemAt.ownerId === S.myId) { }
                else {
                    if (confirm("이 부족에 충성을 맹세하시겠습니까?")) {
                        db.ref('players/' + S.myId).update({ tribeId: tk, tribeColor: totemAt.color });
                        S.myTribeId = tk; S.myTribeColor = totemAt.color;
                    } else {
                        db.ref('blocks/' + tk).transaction(function(cur) {
                            if (!cur || cur.type !== 'totem') return;
                            var nhp = Math.max(0, (cur.hp || 10000) - 20);
                            if (nhp <= 0) {
                                db.ref('players').once('value', function(snap) {
                                    var pl = snap.val() || {};
                                    Object.keys(pl).forEach(function(pid) {
                                        if (pl[pid].tribeId === tk)
                                            db.ref('players/' + pid).update({ tribeId: null, tribeColor: null });
                                    });
                                });
                                return null;
                            }
                            return Object.assign({}, cur, { hp: nhp });
                        });
                    }
                }
                return;
            }

            db.ref('blocks/' + blockKey).once('value', function(snapshot) {
                var existing = snapshot.val();
                if (existing && existing.type === 'door') {
                    var dist = Phaser.Math.Distance.Between(x, y, existing.x, existing.y);
                    if (dist > 20) return;
                    var isOpen = existing.openUntil && Date.now() < existing.openUntil;
                    var pwd = prompt(isOpen ? "🚪 문을 닫으시겠습니까? 비밀번호:" : "🚪 비밀번호를 입력하세요:");
                    if (pwd !== null && pwd === existing.password) {
                        db.ref('blocks/' + blockKey).update({ openUntil: isOpen ? 0 : Date.now() + 15000 });
                    } else if (pwd !== null) { alert("❌ 비밀번호가 틀렸습니다."); }
                } else if (existing && existing.type === 'sign') {
                    var newText = prompt("📜 표지판 기록:", existing.text || "");
                    if (newText !== null && newText !== existing.text) db.ref('blocks/' + blockKey).update({ text: newText });
                } else if (existing && existing.type === 'drop') {
                    db.ref('players/' + S.myId).once('value', function(snap) {
                        var p = snap.val();
                        var s = (p.stone || 0) + (existing.stone || 0);
                        var w = (p.wood || 0) + (existing.wood || 0);
                        db.ref('players/' + S.myId).update({ stone: s, wood: w });
                        db.ref('blocks/' + blockKey).remove();
                    });
                } else if (existing && (existing.type === 'rock' || existing.type === 'tree')) {
                    var res = existing.type === 'rock' ? 'stone' : 'wood';
                    S.gatherProgress[blockKey] = (S.gatherProgress[blockKey] || 0) + 1;
                    if (S.gatherProgress[blockKey] >= 2) {
                        S.gatherProgress[blockKey] = 0;
                        db.ref('blocks/' + blockKey).transaction(function(cur) {
                            if (!cur || (cur.remaining || 0) <= 0) return;
                            return Object.assign({}, cur, { remaining: cur.remaining - 1 });
                        }).then(function(r) {
                            if (r.committed && r.snapshot.val() && r.snapshot.val().remaining >= 0) {
                                db.ref('players/' + S.myId).once('value', function(snap) {
                                    var p = snap.val();
                                    var up = {}; up[res] = (p[res] || 0) + 1;
                                    db.ref('players/' + S.myId).update(up);
                                });
                                if (r.snapshot.val().remaining <= 0) db.ref('blocks/' + blockKey).remove();
                            }
                        });
                    }
                } else if (!existing) {
                    var totem = getTotemAt(gridX, gridY);
                    if (totem && !isOwnerOrCitizenOf(totem)) {
                        alert("이 영토에서 건설할 권한이 없습니다.");
                        return;
                    }
                    var cost = S.currentMaterial === 'wall' ? { stone: 1, wood: 0 } : (S.currentMaterial === 'sign' || S.currentMaterial === 'door') ? { stone: 0, wood: 1 } : S.currentMaterial === 'totem' ? { stone: 100, wood: 100 } : { stone: 0, wood: 0 };
                    if (cost.stone > 0 || cost.wood > 0) {
                        db.ref('players/' + S.myId).once('value', function(snap) {
                            var p = snap.val();
                            var s = p.stone || 0, w = p.wood || 0;
                            if (s < cost.stone || w < cost.wood) { alert("재료가 부족합니다."); return; }
                            if (S.currentMaterial === 'door') {
                                var pwd = prompt("🚪 이 문의 비밀번호는? (예: 1234)");
                                if (pwd !== null && pwd.trim() !== "") {
                                    db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'door', password: pwd.trim() });
                                    db.ref('players/' + S.myId).update({ stone: s - cost.stone, wood: w - cost.wood });
                                }
                            } else if (S.currentMaterial === 'sign') {
                                var signText = prompt("🪧 이 표지판에 무엇을 기록하시겠습니까?");
                                if (signText !== null) {
                                    db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'sign', text: signText });
                                    db.ref('players/' + S.myId).update({ stone: s - cost.stone, wood: w - cost.wood });
                                }
                            } else if (S.currentMaterial === 'wall') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'wall' });
                                db.ref('players/' + S.myId).update({ stone: s - 1 });
                            } else if (S.currentMaterial === 'totem') {
                                db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: 'totem', ownerId: S.myId, hp: 10000, color: S.myColor });
                                db.ref('players/' + S.myId).update({ stone: s - 100, wood: w - 100, tribeId: blockKey, tribeColor: S.myColor });
                                S.myTribeId = blockKey; S.myTribeColor = S.myColor;
                            }
                        });
                    } else {
                        db.ref('blocks/' + blockKey).set({ x: gridX, y: gridY, type: S.currentMaterial });
                    }
                }
            });
        };

        gameContainer.addEventListener('mousedown', doBuildOrDelete, true);

        var chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter' && chatInput.value.trim() !== "") {
                var msg = chatInput.value;
                chatInput.value = "";
                db.ref('players/' + S.myId).update({ chat: msg, chatTime: firebase.database.ServerValue.TIMESTAMP });
                window.FW.player.showChatBubble(self.myText, msg, S.myNickname);
                S.game.canvas.focus();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'e' && document.activeElement && document.activeElement.id !== 'chat-input') {
                e.preventDefault();
                var s = parseInt(prompt("떨어뜨릴 돌 개수:", "0") || "0");
                var w = parseInt(prompt("떨어뜨릴 나무 개수:", "0") || "0");
                if ((s > 0 || w > 0) && s >= 0 && w >= 0) {
                    db.ref('players/' + S.myId).once('value', function(snap) {
                        var p = snap.val();
                        var ms = Math.min(s, p.stone || 0), mw = Math.min(w, p.wood || 0);
                        if (ms > 0 || mw > 0) {
                            var gx = Math.floor(S.myPlayer.x / 32) * 32 + 16;
                            var gy = Math.floor(S.myPlayer.y / 32) * 32 + 16;
                            db.ref('blocks/' + gx + '_' + gy).set({ x: gx, y: gy, type: 'drop', stone: ms, wood: mw });
                            db.ref('players/' + S.myId).update({ stone: (p.stone || 0) - ms, wood: (p.wood || 0) - mw });
                        }
                    });
                }
            }
        });

        this.time.addEvent({
            delay: 50, loop: true,
            callback: function() {
                var v = S.myPlayer.body.velocity;
                if (v.x !== 0 || v.y !== 0) {
                    db.ref('players/' + S.myId).update({ x: S.myPlayer.x, y: S.myPlayer.y });
                }
                self.myText.x = S.myPlayer.x;
                self.myText.y = S.myPlayer.y - 35;
                window.FW.player.drawHpBar(self.myHpBar, S.myPlayer.x, S.myPlayer.y - 28, S.myHp || 100, 100);
            }
        });

        db.ref('players/' + S.myId).on('value', function(s) {
            var d = s.val();
            if (d) {
                S.myHp = d.hp || 100;
                S.myStone = d.stone || 0; S.myWood = d.wood || 0;
                S.myTribeId = d.tribeId || null; S.myTribeColor = d.tribeColor || null;
                S.myPlayer.setTint(d.tribeColor || d.color || S.myColor);
                document.getElementById('my-stone').innerText = S.myStone;
                document.getElementById('my-wood').innerText = S.myWood;
                if (d.x !== undefined && d.y !== undefined) { S.myPlayer.x = d.x; S.myPlayer.y = d.y; }
            }
        });
        db.ref('players').on('child_added', function(s) { window.FW.player.handlePlayerUpdate(s, self, 'add'); });
        db.ref('players').on('child_changed', function(s) { window.FW.player.handlePlayerUpdate(s, self, 'change'); });
        db.ref('players').on('child_removed', function(s) {
            var id = s.key;
            if (S.players[id]) { S.players[id].destroy(); delete S.players[id]; }
            if (S.playerTexts[id]) { S.playerTexts[id].destroy(); delete S.playerTexts[id]; }
            if (S.playerHpBars[id]) { S.playerHpBars[id].destroy(); delete S.playerHpBars[id]; }
        });

        db.ref('blocks').on('child_added', function(s) { window.FW.map.createBlock(self, s.key, s.val()); });
        db.ref('blocks').on('child_changed', function(s) {
            var data = s.val();
            if (data && data.type === 'totem') S.totemsData[s.key] = { x: data.x, y: data.y, ownerId: data.ownerId, hp: data.hp || 10000, color: data.color || 0xFFD700 };
            window.FW.map.removeBlock(s.key);
            window.FW.map.createBlock(self, s.key, data);
        });
        db.ref('blocks').on('child_removed', function(s) {
            var key = s.key;
            if (S.totemsData[key]) {
                db.ref('players').once('value', function(snap) {
                    var pl = snap.val() || {};
                    Object.keys(pl).forEach(function(pid) {
                        if (pl[pid].tribeId === key)
                            db.ref('players/' + pid).update({ tribeId: null, tribeColor: null });
                    });
                });
            }
            window.FW.map.removeBlock(key);
        });

        db.ref('players/' + S.myId).onDisconnect().remove();
        S.game = this.sys.game;
    }

    function update() {
        if (!S.myPlayer) return;
        var now = Date.now();
        S.doorKeys.forEach(function(key) {
            var block = S.blocks[key];
            if (!block || !block.body) return;
            var isOpen = S.doorOpenUntil[key] && now < S.doorOpenUntil[key];
            block.setAlpha(isOpen ? 0.25 : 1);
            block.body.checkCollision.none = isOpen;
        });

        var uiText = document.getElementById('material-indicator');
        if (Phaser.Input.Keyboard.JustDown(S.key1)) { S.currentMaterial = 'wall'; uiText.innerText = "현재 재료: 🔲 돌벽 (1)"; }
        if (Phaser.Input.Keyboard.JustDown(S.key2)) { S.currentMaterial = 'grass'; uiText.innerText = "현재 재료: 🌿 잔디 (2)"; }
        if (Phaser.Input.Keyboard.JustDown(S.key3)) { S.currentMaterial = 'water'; uiText.innerText = "현재 재료: 💧 물 (3)"; }
        if (Phaser.Input.Keyboard.JustDown(S.key4)) { S.currentMaterial = 'sign'; uiText.innerText = "현재 재료: 🪧 표지판 (4)"; }
        if (Phaser.Input.Keyboard.JustDown(S.key5)) { S.currentMaterial = 'door'; uiText.innerText = "현재 재료: 🚪 문 (5)"; }
        if (Phaser.Input.Keyboard.JustDown(S.key6)) { S.currentMaterial = 'totem'; uiText.innerText = "현재 재료: 🏛 토템 (6, 돌100+나무100)"; }

        var pointer = this.input.activePointer;
        S.marker.x = Math.floor(pointer.worldX / 32) * 32;
        S.marker.y = Math.floor(pointer.worldY / 32) * 32;
        if (S.shiftKey.isDown) S.marker.lineStyle(2, 0xff0000, 1);
        else S.marker.lineStyle(2, 0xffffff, 1);

        var speed = 160;
        S.myPlayer.setVelocity(0);
        if (document.activeElement !== document.getElementById('chat-input')) {
            if (S.keyA.isDown) { S.myPlayer.setVelocityX(-speed); S.lastDir.x = -1; S.lastDir.y = 0; }
            else if (S.keyD.isDown) { S.myPlayer.setVelocityX(speed); S.lastDir.x = 1; S.lastDir.y = 0; }
            if (S.keyW.isDown) { S.myPlayer.setVelocityY(-speed); S.lastDir.x = 0; S.lastDir.y = -1; }
            else if (S.keyS.isDown) { S.myPlayer.setVelocityY(speed); S.lastDir.x = 0; S.lastDir.y = 1; }
        }

        if (Phaser.Input.Keyboard.JustDown(S.keySpace) && (S.lastDir.x !== 0 || S.lastDir.y !== 0)) {
            var px = S.myPlayer.x, py = S.myPlayer.y;
            var pushDist = 64, pushRange = 56;
            var fx = this.add.circle(px + S.lastDir.x * 24, py + S.lastDir.y * 24, 4, 0xffffff, 0.9);
            this.tweens.add({ targets: fx, scaleX: 3, scaleY: 3, alpha: 0, duration: 200, onComplete: function() { fx.destroy(); } });
            S.otherPlayersGroup.getChildren().forEach(function(p) {
                var dx = p.x - px, dy = p.y - py;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < pushRange && dist > 0) {
                    var dot = (dx * S.lastDir.x + dy * S.lastDir.y) / dist;
                    if (dot > 0.5) {
                        var id = Object.keys(S.players).find(function(k) { return S.players[k] === p; });
                        if (id) {
                            var nx = p.x + (dx / dist) * pushDist;
                            var ny = p.y + (dy / dist) * pushDist;
                            this.tweens.add({
                                targets: p, x: nx, y: ny,
                                duration: 180, ease: 'Quad.easeOut',
                                onComplete: function() { db.ref('players/' + id).update({ x: nx, y: ny }); }
                            });
                        }
                    }
                }
            }.bind(this));
        }
    }

    var loginScreen = document.getElementById('login-screen');
    var nickInput = document.getElementById('nickname-input');
    var startBtn = document.getElementById('start-btn');

    function startGame() {
        var name = nickInput.value.trim();
        if (name === "") { alert("이름을 입력해주세요!"); return; }
        S.myNickname = name;
        S.myId = 'user_' + Math.floor(Math.random() * 1000000);
        S.myColor = Phaser.Display.Color.RandomRGB(50, 255).color;
        loginScreen.style.display = 'none';
        S.game = new Phaser.Game({
            type: Phaser.AUTO,
            width: 800,
            height: 600,
            parent: 'game-container',
            backgroundColor: '#2d2d2d',
            physics: { default: 'arcade', arcade: { debug: false } },
            disableContextMenu: true,
            scene: { preload: preload, create: create, update: update }
        });
    }

    startBtn.addEventListener('click', startGame);
    nickInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') startGame(); });
})();
