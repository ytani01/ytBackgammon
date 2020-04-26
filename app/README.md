# 

## ボード情報

```
gameinfo
{
    game: {number},
    match: {number},
    score: [{nubmer}, {number}],
    turn: {number 0 or 1 or -1},
    board: {
        cube: {
            player: {number 0 or 1 or -1},
            value: {number 1, 2, 4, 8, 16, 32, 64},
            accepted: {bool}
        },
        point: [
            [],
            [0, 2],
            [],
            [],
            [],
            [],
            [1, 5],
            [],
            [1, 3],
            [],
            [],
            [],
            [0, 5],
            [1, 5],
            [],
            [],
            [0, 3],
            [],
            [0, 5],
            [],
            [],
            [],
            [],
            [1, 2],
            [],
            [],
            []
        ]
    },
    dice: [
        [{number 0,1-6}, ..],
        [{number 0,1-6}, ..]
    ]
}
```
