// The built-in hands, in picker order, with the ink each one draws in.
// Mirrors PointerStyle.builtIn (Sources/TinyHand/PointerStyle.swift).

const PURPLE = 0x8754F2;
const RED = 0xFF291F;

export const HANDS = [
    ['lavender', 'Lavender toy', PURPLE],
    ['glove', 'Cursor glove', PURPLE],
    ['coral', 'Coral vinyl', RED],
    ['plush', 'Plush', 0x2F86F0],
    ['robot', 'Robot', 0x16A87A],
    ['pink', 'Bubblegum', 0xEE4F98],
    ['blue', 'Sky', 0x2F86F0],
    ['mint', 'Mint', 0x16A87A],
    ['lemon', 'Lemon', 0xF2B705],
    ['black', 'Midnight', 0x1D1D21],
    ['chrome', 'Chrome', 0x6B7380],
    ['holo', 'Holo', PURPLE],
    ['fuzzy', 'Fuzzy', PURPLE],
    ['wood', 'Wood', 0x9A5E2C],
    ['marble', 'Marble', 0x6B7380],
    ['terrazzo', 'Terrazzo', 0xF0561D],
    ['glass', 'Glass', 0x1597E5],
    ['jelly', 'Jelly', 0xA33FE6],
    ['pastel', 'Pastel', 0xEE4F98],
    ['pixel', 'Pixel', 0x1D1D21],
    ['lowpoly', 'Low poly', PURPLE],
    ['knit', 'Knit', PURPLE],
    ['skeleton', 'Skeleton', 0x9A5E2C],
    ['astro', 'Astronaut', 0x2F86F0],
    ['space', 'Space', RED],
    ['monster', 'Monster', 0x3E9E2E],
    ['water', 'Water', 0x1597E5],
    ['lava', 'Lava', 0xF0561D],
    ['grass', 'Grass', 0x3E9E2E],
    ['cactus', 'Cactus', 0x3E9E2E],
    ['choco', 'Chocolate', 0x9A5E2C],
    ['cloud', 'Cloud', 0x2F86F0],
    ['mech', 'Mech', 0xF0561D],
    ['neon', 'Neon', 0xE0309A],
    ['leaf', 'Leaf', 0x3E9E2E],
    ['cookie', 'Gingerbread', 0x9A5E2C],
].map(([id, title, ink]) => ({id, title, ink}));

const rgb = v => [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];

export function inkFor(id) {
    return rgb(HANDS.find(h => h.id === id)?.ink ?? PURPLE);
}

export const SOUNDS = [
    ['thock', 'Thock'], ['click', 'Click'], ['pop', 'Pop'],
    ['wood', 'Wood'], ['boop', 'Boop'], ['squeak', 'Squeak'], ['off', 'Off'],
].map(([id, title]) => ({id, title}));
