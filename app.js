import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAz7NAuArjCtEskg_lHRGBe7ExkWnuTxFs",
  authDomain: "uno-523ca.firebaseapp.com",
  databaseURL: "https://uno-523ca-default-rtdb.firebaseio.com",
  projectId: "uno-523ca",
  storageBucket: "uno-523ca.firebasestorage.app",
  messagingSenderId: "622881401741",
  appId: "1:622881401741:web:2ad6ec485cf5bc5d562bc4",
  measurementId: "G-LMPTSX3EC7"
};

let db = null;
try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
} catch (e) {
    console.log("Firebase connection error:", e);
}

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const playerNameInput = document.getElementById('player-name');
const displayRoomCode = document.getElementById('display-room-code');
const playersListDiv = document.getElementById('players-list');
const roomStatus = document.getElementById('room-status');
const startGameBtn = document.getElementById('start-game-btn');
const playerHandDiv = document.getElementById('player-hand');
const discardPileDiv = document.getElementById('discard-pile');
const drawPileDiv = document.getElementById('draw-pile');
const turnIndicator = document.getElementById('turn-indicator');
const gameOverModal = document.getElementById('game-over-modal');
const loserNameDisplay = document.getElementById('loser-name-display');

let roomId = '';
let playerName = '';
let playerId = localStorage.getItem('uno_player_id');
if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substring(2, 7);
    localStorage.setItem('uno_player_id', playerId);
}

let pendingCardIndex = null;

const colors = ['red', 'blue', 'green', 'yellow'];
const types = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function generateDeck() {
    let deck = [];
    colors.forEach(color => {
        types.forEach(type => {
            deck.push({ color, type });
            if (type !== '0') deck.push({ color, type });
        });
    });

    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'black', type: 'wild' });
        deck.push({ color: 'black', type: 'wild4' });
    }

    return deck.sort(() => Math.random() - 0.5);
}

// ইন-গেম কালার পিকার পপআপ
function createColorPickerModal() {
    if (document.getElementById('color-picker-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'color-picker-modal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center hidden z-50 p-4';
    modal.innerHTML = `
        <div class="bg-slate-800 p-6 rounded-2xl border-2 border-slate-600 max-w-sm w-full text-center shadow-2xl">
            <h3 class="text-xl font-bold text-white mb-4">পছন্দের রং নির্বাচন করুন</h3>
            <div class="grid grid-cols-2 gap-4">
                <button data-color="red" class="color-choice-btn bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition">RED</button>
                <button data-color="blue" class="color-choice-btn bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition">BLUE</button>
                <button data-color="green" class="color-choice-btn bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition">GREEN</button>
                <button data-color="yellow" class="color-choice-btn bg-amber-400 hover:bg-amber-300 text-black font-bold py-4 rounded-xl shadow-lg active:scale-95 transition">YELLOW</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('.color-choice-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const selectedColor = e.target.getAttribute('data-color');
            modal.classList.add('hidden');
            if (pendingCardIndex !== null) {
                await executePlayCard(pendingCardIndex, selectedColor);
                pendingCardIndex = null;
            }
        });
    });
}
createColorPickerModal();

createRoomBtn.addEventListener('click', async () => {
    playerName = playerNameInput.value.trim();
    if (!playerName) { alert('আপনার নাম লিখুন!'); return; }
    
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    displayRoomCode.innerText = roomId;

    const roomRef = ref(db, 'rooms/' + roomId);
    await set(roomRef, {
        host: playerId,
        status: 'waiting',
        players: {
            [playerId]: { name: playerName, hand: [] }
        },
        playerOrder: [playerId]
    });

    enterGameRoom();
    startGameBtn.classList.remove('hidden');
    listenRoomChanges();
});

joinRoomBtn.addEventListener('click', async () => {
    playerName = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!playerName || !code) { alert('নাম ও রুম কোড দিন!'); return; }

    roomId = code;
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) { alert('রুমটি পাওয়া যায়নি!'); return; }

    displayRoomCode.innerText = roomId;

    let data = snapshot.val();
    let playerOrder = data.playerOrder || [];
    if (!playerOrder.includes(playerId)) {
        playerOrder.push(playerId);
    }

    await update(roomRef, {
        [`players/${playerId}`]: { name: playerName, hand: [] },
        playerOrder: playerOrder
    });

    enterGameRoom();
    listenRoomChanges();
});

function enterGameRoom() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

startGameBtn.addEventListener('click', async () => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();

    let deck = generateDeck();
    let players = data.players;
    let playerKeys = data.playerOrder;

    playerKeys.forEach(pKey => {
        let hand = [];
        for (let i = 0; i < 7; i++) {
            hand.push(deck.pop());
        }
        players[pKey].hand = hand;
    });

    let topCard = deck.pop();
    while(topCard.color === 'black' || topCard.type === 'skip' || topCard.type === 'reverse' || topCard.type === 'draw2') {
        deck.unshift(topCard);
        topCard = deck.pop();
    }

    await update(roomRef, {
        status: 'playing',
        deck: deck,
        discardPile: topCard,
        currentColor: topCard.color,
        currentTurnIndex: 0,
        direction: 1,
        players: players
    });
});

drawPileDiv.addEventListener('click', async () => {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();

    if (!data || data.status !== 'playing') return;

    let playerKeys = data.playerOrder;
    if (playerKeys[data.currentTurnIndex] !== playerId) {
        alert('এখন আপনার পালা নয়!');
        return;
    }

    let deck = data.deck || [];
    if (deck.length === 0) { alert('ডেক খালি!'); return; }

    let drawnCard = deck.pop();
    let rawHand = data.players[playerId].hand || [];
    let myHand = Array.isArray(rawHand) ? [...rawHand] : Object.values(rawHand);
    myHand.push(drawnCard);

    let direction = data.direction || 1;
    let nextTurnIndex = getNextTurnIndex(data.currentTurnIndex, playerKeys.length, 1, direction);

    await update(roomRef, {
        deck: deck,
        [`players/${playerId}/hand`]: myHand,
        currentTurnIndex: nextTurnIndex
    });
});

function getNextTurnIndex(currentIndex, totalPlayers, step = 1, direction = 1) {
    let next = (currentIndex + (step * direction)) % totalPlayers;
    if (next < 0) next += totalPlayers;
    return next;
}

function listenRoomChanges() {
    const roomRef = ref(db, `rooms/${roomId}`);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        playersListDiv.innerHTML = '';
        let playerKeys = data.playerOrder || [];
        
        if (data.players) {
            playerKeys.forEach((pKey, idx) => {
                let p = data.players[pKey];
                if (!p) return;
                let rawHand = p.hand || [];
                let handCount = Array.isArray(rawHand) ? rawHand.length : Object.keys(rawHand).length;
                const span = document.createElement('span');
                let isCurrent = data.currentTurnIndex === idx;
                span.className = `px-3 py-1 rounded-lg text-sm border flex items-center gap-1 ${isCurrent ? 'bg-blue-600 border-white text-white font-bold animate-pulse' : 'bg-slate-700 border-slate-600 text-slate-300'}`;
                span.innerText = `${p.name} (${handCount} কার্ড)`;
                playersListDiv.appendChild(span);
            });
        }

        if (data.status === 'playing') {
            roomStatus.innerText = 'খেলা চলছে!';
            if (startGameBtn) startGameBtn.classList.add('hidden');

            if (data.players[playerId] && data.players[playerId].hand) {
                let rawHand = data.players[playerId].hand;
                let myHand = Array.isArray(rawHand) ? rawHand : Object.values(rawHand);
                renderHand(myHand);
            }

            if (data.discardPile) {
                renderCard(discardPileDiv, data.discardPile, data.currentColor);
            }

            let currentTurnPlayerId = playerKeys[data.currentTurnIndex];
            if (currentTurnPlayerId === playerId) {
                turnIndicator.innerText = "আপনার পালা! কার্ড ফেলুন অথবা ডেক থেকে তুলুন।";
                turnIndicator.className = "mt-4 text-lg font-bold text-green-400 animate-pulse";
            } else {
                let currentName = data.players[currentTurnPlayerId]?.name || "অন্য খেলোয়াড়";
                turnIndicator.innerText = `${currentName}-এর পালা...`;
                turnIndicator.className = "mt-4 text-lg font-semibold text-yellow-400";
            }
        }

        if (data.status === 'ended' && data.winner) {
            loserNameDisplay.innerText = `বিজয়ী: 🏆 ${data.winner}\nপরাজিত: ❌ ${data.loser || 'অন্যান্য প্লেয়ার'}`;
            gameOverModal.classList.remove('hidden');
        }
    });
}

// কার্ড ক্লিক করার প্রধান ফাংশন
async function onCardClick(cardIndex) {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();

    if (!data || data.status !== 'playing') return;

    let playerKeys = data.playerOrder;
    if (playerKeys[data.currentTurnIndex] !== playerId) {
        alert('এখন আপনার পালা নয়!');
        return;
    }

    let rawHand = data.players[playerId].hand;
    let myHand = Array.isArray(rawHand) ? [...rawHand] : Object.values(rawHand);
    let card = myHand[cardIndex];

    if (!card) return;

    let topCard = data.discardPile;
    let activeColor = (topCard.color === 'black') ? data.currentColor : topCard.color;

    // কালার ও টাইপ ভ্যালিডেশন
    let isValid = false;
    if (card.color === 'black') {
        isValid = true;
    } else if (
        card.color.toLowerCase() === activeColor.toLowerCase() || 
        card.type.toString() === topCard.type.toString()
    ) {
        isValid = true;
    }

    if (!isValid) {
        alert(`এই কার্ডটি ফেলা যাবে না! বর্তমান রং: ${activeColor.toUpperCase()} অথবা নম্বর/টাইপ (${topCard.type.toUpperCase()})-এর সাথে মেলাতে হবে।`);
        return;
    }

    if (card.color === 'black') {
        pendingCardIndex = cardIndex;
        document.getElementById('color-picker-modal').classList.remove('hidden');
    } else {
        await executePlayCard(cardIndex, card.color);
    }
}

// কার্ড চাল কার্যকর করার লজিক
async function executePlayCard(cardIndex, chosenColor) {
    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();

    let playerKeys = data.playerOrder;
    let totalPlayers = playerKeys.length;
    let currentTurn = data.currentTurnIndex;
    let direction = data.direction || 1;
    let deck = data.deck || [];

    let rawHand = data.players[playerId].hand;
    let myHand = Array.isArray(rawHand) ? [...rawHand] : Object.values(rawHand);
    let card = myHand.splice(cardIndex, 1)[0];

    let nextActiveColor = (card.color === 'black') ? chosenColor : card.color;
    let step = 1;

    let updates = {};

    if (card.type === 'skip') {
        step = 2;
    } else if (card.type === 'reverse') {
        if (totalPlayers === 2) {
            step = 2;
        } else {
            direction = direction * -1;
            step = 1;
        }
    } else if (card.type === 'draw2') {
        let victimIndex = getNextTurnIndex(currentTurn, totalPlayers, 1, direction);
        let victimKey = playerKeys[victimIndex];
        let rawVictimHand = data.players[victimKey].hand || [];
        let victimHand = Array.isArray(rawVictimHand) ? [...rawVictimHand] : Object.values(rawVictimHand);
        for (let i = 0; i < 2; i++) {
            if (deck.length > 0) victimHand.push(deck.pop());
        }
        updates[`players/${victimKey}/hand`] = victimHand;
        step = 2;
    } else if (card.type === 'wild4') {
        let victimIndex = getNextTurnIndex(currentTurn, totalPlayers, 1, direction);
        let victimKey = playerKeys[victimIndex];
        let rawVictimHand = data.players[victimKey].hand || [];
        let victimHand = Array.isArray(rawVictimHand) ? [...rawVictimHand] : Object.values(rawVictimHand);
        for (let i = 0; i < 4; i++) {
            if (deck.length > 0) victimHand.push(deck.pop());
        }
        updates[`players/${victimKey}/hand`] = victimHand;
        step = 2;
    }

    let nextTurnIndex = getNextTurnIndex(currentTurn, totalPlayers, step, direction);

    updates.discardPile = card;
    updates.currentColor = nextActiveColor;
    updates.deck = deck;
    updates.direction = direction;
    updates.currentTurnIndex = nextTurnIndex;
    updates[`players/${playerId}/hand`] = myHand;

    if (myHand.length === 0) {
        updates.status = 'ended';
        updates.winner = playerName;
        let losers = playerKeys
            .filter(pk => pk !== playerId)
            .map(pk => data.players[pk]?.name || 'Player')
            .join(', ');
        updates.loser = losers;
    }

    await update(roomRef, updates);
}

function getSymbol(type) {
    if (type === 'skip') return '⊘';
    if (type === 'reverse') return '⇄';
    if (type === 'draw2') return '+2';
    if (type === 'wild') return '🌈';
    if (type === 'wild4') return '+4';
    return type;
}

function renderCard(container, card, currentColor) {
    container.innerHTML = '';
    const div = document.createElement('div');
    
    let bgStyle = 'bg-red-600';
    let textColor = 'text-white';

    if (card.color === 'blue') bgStyle = 'bg-blue-600';
    else if (card.color === 'green') bgStyle = 'bg-emerald-600';
    else if (card.color === 'yellow') { bgStyle = 'bg-amber-400'; textColor = 'text-black'; }
    else if (card.color === 'black') bgStyle = 'bg-slate-950';

    let symbol = getSymbol(card.type);
    let activeCol = (card.color === 'black') ? currentColor : card.color;

    div.className = `w-28 h-40 ${bgStyle} ${textColor} rounded-2xl border-4 border-white shadow-2xl flex flex-col justify-between p-2 font-black select-none relative overflow-hidden transform hover:scale-105 transition`;
    
    let activeBgTag = 'bg-red-500';
    if (activeCol === 'blue') activeBgTag = 'bg-blue-500';
    if (activeCol === 'green') activeBgTag = 'bg-emerald-500';
    if (activeCol === 'yellow') activeBgTag = 'bg-amber-400';

    div.innerHTML = `
        <div class="flex justify-between items-center text-xs font-bold">
            <span>${symbol}</span>
            <span class="text-[9px] uppercase px-1 py-0.5 rounded bg-black/40 text-white">${activeCol}</span>
        </div>
        <div class="w-16 h-24 bg-white/20 rounded-full mx-auto flex items-center justify-center transform -rotate-12 shadow-inner border border-white/30">
            <span class="text-2xl drop-shadow-md font-extrabold">${symbol}</span>
        </div>
        <div class="flex justify-between items-center text-xs font-bold">
            <div class="w-4 h-4 rounded-full border border-white ${activeBgTag} shadow-md" title="চালু থাকা রং: ${activeCol}"></div>
            <span>${symbol}</span>
        </div>
    `;

    container.appendChild(div);
}

function renderHand(hand) {
    playerHandDiv.innerHTML = '';
    hand.forEach((card, index) => {
        let bgStyle = 'bg-red-600';
        let textColor = 'text-white';

        if (card.color === 'blue') bgStyle = 'bg-blue-600';
        else if (card.color === 'green') bgStyle = 'bg-emerald-600';
        else if (card.color === 'yellow') { bgStyle = 'bg-amber-400'; textColor = 'text-black'; }
        else if (card.color === 'black') bgStyle = 'bg-gradient-to-tr from-red-500 via-emerald-500 to-blue-500';

        let symbol = getSymbol(card.type);

        const cardEl = document.createElement('div');
        cardEl.className = `w-20 h-32 ${bgStyle} ${textColor} rounded-xl border-2 border-white shadow-lg flex flex-col justify-between p-2 font-bold cursor-pointer hover:-translate-y-4 hover:shadow-2xl transition-all transform select-none flex-shrink-0 relative`;
        
        cardEl.innerHTML = `
            <span class="text-xs text-left">${symbol}</span>
            <div class="w-10 h-14 bg-white/20 rounded-full mx-auto flex items-center justify-center transform -rotate-12 shadow-inner">
                <span class="text-base font-black">${symbol}</span>
            </div>
            <span class="text-xs text-right transform rotate-180">${symbol}</span>
        `;
        
        cardEl.addEventListener('click', () => {
            onCardClick(index);
        });

        playerHandDiv.appendChild(cardEl);
    });
}