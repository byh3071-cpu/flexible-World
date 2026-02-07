/* map.js - 블록 건설, 파괴, 자원 생성 */
(function() {
    'use strict';
    const S = window.FW.State;
    const db = window.FW.db;

    const ROCK_TARGET = 25, TREE_TARGET = 25, REMAINING_PER = 8;

    window.FW.map = {
        spawnResources: function(rockNeed, treeNeed) {
            const positions = [];
            for (let gx = 0; gx < 25; gx++) for (let gy = 0; gy < 19; gy++) {
                positions.push({ x: gx * 32 + 16, y: gy * 32 + 16, key: (gx * 32 + 16) + '_' + (gy * 32 + 16) });
            }
            Phaser.Utils.Array.Shuffle(positions);
            positions.forEach(function(p, i) {
                if (i < rockNeed) {
                    db.ref('blocks/' + p.key).transaction(function(cur) {
                        if (!cur) return { x: p.x, y: p.y, type: 'rock', remaining: REMAINING_PER };
                        return;
                    });
                } else if (i < rockNeed + treeNeed) {
                    db.ref('blocks/' + p.key).transaction(function(cur) {
                        if (!cur) return { x: p.x, y: p.y, type: 'tree', remaining: REMAINING_PER };
                        return;
                    });
                }
            });
        },

        maybeSpawnResources: function() {
            db.ref('blocks').once('value', function(snap) {
                const v = snap.val() || {};
                const arr = Object.values(v);
                const rockCnt = arr.filter(function(b) { return b && b.type === 'rock'; }).length;
                const treeCnt = arr.filter(function(b) { return b && b.type === 'tree'; }).length;
                const rockNeed = Math.max(0, ROCK_TARGET - rockCnt);
                const treeNeed = Math.max(0, TREE_TARGET - treeCnt);
                if (rockNeed > 0 || treeNeed > 0) {
                    window.FW.map.spawnResources(rockNeed, treeNeed);
                }
            });
        },

        createBlock: function(scene, key, data) {
            this.removeBlock(key);
            var block;
            if (data.type === 'wall' || !data.type) {
                block = S.wallGroup.create(data.x, data.y, 'wall');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(5);
            } else if (data.type === 'grass') {
                block = S.floorGroup.create(data.x, data.y, 'grass');
                block.setDepth(0);
            } else if (data.type === 'water') {
                block = S.floorGroup.create(data.x, data.y, 'water');
                block.setDepth(0);
            } else if (data.type === 'sign') {
                block = S.signGroup.create(data.x, data.y, 'sign');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(5);
            } else if (data.type === 'door') {
                block = S.doorGroup.create(data.x, data.y, 'door');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(5);
                S.doorKeys.add(key);
                S.doorOpenUntil[key] = data.openUntil || 0;
            } else if (data.type === 'rock') {
                block = S.resourceGroup.create(data.x, data.y, 'rock');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(5);
            } else if (data.type === 'tree') {
                block = S.resourceGroup.create(data.x, data.y, 'tree');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(5);
            } else if (data.type === 'drop') {
                block = scene.add.container(data.x, data.y, [
                    scene.add.image(0, 0, 'drop'),
                    scene.add.text(0, -8, '🪨' + (data.stone || 0) + ' 🪵' + (data.wood || 0), { fontSize: '8px', fill: '#fff' }).setOrigin(0.5)
                ]);
                block.setDepth(5);
                S.dropGroup.add(block);
            } else if (data.type === 'totem') {
                block = S.totemGroup.create(data.x, data.y, 'totem');
                block.body.setSize(32, 32); block.body.updateFromGameObject();
                block.refreshBody(); block.setDepth(6);
                block.setTint(data.color || 0xFFD700);
                S.totemsData[key] = { x: data.x, y: data.y, ownerId: data.ownerId, hp: data.hp || 10000, color: data.color || 0xFFD700 };
            }
            S.blocks[key] = block;
        },

        removeBlock: function(key) {
            if (S.totemsData[key]) delete S.totemsData[key];
            S.doorKeys.delete(key);
            delete S.doorOpenUntil[key];
            if (S.blocks[key]) { S.blocks[key].destroy(); delete S.blocks[key]; }
        }
    };
})();
