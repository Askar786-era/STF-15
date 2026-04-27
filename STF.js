const socket = io();
const BASE_URL = window.location.origin + '/api';

// --- SPA NAVIGATION ---
function showPage(pageId) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    window.scrollTo(0, 0);
}

// --- AUTH CHECK ---
function checkAuth() {
    const donorInfo = JSON.parse(localStorage.getItem('donorInfo'));
    const authContainer = document.getElementById('headerAuth');
    
    if (donorInfo) {
        authContainer.innerHTML = `
            <div class="user-pill">
                <span onclick="showPage('dashboard')">👤 ${donorInfo.fullName}</span>
                <button onclick="logout()" class="logout-btn">Logout</button>
            </div>
        `;
        document.getElementById('dashName').innerText = donorInfo.fullName;
        document.getElementById('dashBlood').innerText = donorInfo.bloodGroup;
    } else {
        authContainer.innerHTML = `
            <button class="login-btn" onclick="showPage('login')">🔒 Login</button>
            <span class="active-status">● Active</span>
        `;
    }
}

function logout() {
    localStorage.removeItem('donorInfo');
    window.location.reload();
}

// --- REAL-TIME UPDATES ---
socket.on('donorCountUpdate', (count) => {
    const el = document.getElementById('count-donors');
    if (el) el.innerText = count;
});

// --- REGISTRATION ---
document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        bloodGroup: document.getElementById('regBloodGroup').value,
        fullName: document.getElementById('regFullName').value,
        phone: document.getElementById('regPhone').value,
        password: document.getElementById('regPassword').value,
        city: document.getElementById('regCity').value,
        state: document.getElementById('regState').value
    };
    const msg = document.getElementById('regMsg');
    msg.innerText = 'Processing...';

    try {
        const res = await fetch(`${BASE_URL}/donors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            msg.innerText = 'Success! You can now login.';
            e.target.reset();
            setTimeout(() => showPage('login'), 1500);
        } else {
            msg.innerText = 'Error registering.';
        }
    } catch (err) { msg.innerText = 'Network error.'; }
};

// --- LOGIN ---
document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const result = await res.json();
        if (result.success) {
            localStorage.setItem('donorInfo', JSON.stringify(result.donor));
            checkAuth();
            showPage('dashboard');
        } else { alert('Invalid credentials'); }
    } catch (err) { alert('Server error'); }
};

// --- SEARCH ---
document.getElementById('searchForm').onsubmit = async (e) => {
    e.preventDefault();
    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '<div class="loader">Searching...</div>';

    const bg = document.getElementById('searchBloodGroup').value;
    const city = document.getElementById('searchCity').value;
    const state = document.getElementById('searchState').value;

    try {
        const query = new URLSearchParams({ bloodGroup: bg, city, state }).toString();
        const res = await fetch(`${BASE_URL}/donors/search?${query}`);
        const donors = await res.json();

        if (donors.length === 0) {
            resultsEl.innerHTML = '<p>No donors found.</p>';
            return;
        }

        let html = '<div class="donor-list">';
        donors.forEach(d => {
            html += `
                <div class="donor-card">
                    <div>
                        <strong>${d.fullName}</strong> (${d.bloodGroup})<br>
                        <small>📍 ${d.city}, ${d.state}</small>
                    </div>
                    <button onclick="startWebRTCCall('${d.phone}', '${d.fullName}')">📞 Call</button>
                </div>
            `;
        });
        resultsEl.innerHTML = html + '</div>';
    } catch (err) { resultsEl.innerHTML = 'Error searching.'; }
};

// --- DASHBOARD & ONLINE STATUS ---
let isOnline = false;
const statusBadge = document.getElementById('statusBadge');
const toggleBtn = document.getElementById('toggleOnline');

socket.on('connect', () => {
    const data = JSON.parse(localStorage.getItem('donorInfo'));
    if (data && !isOnline) {
        statusBadge.innerText = 'Offline (Ready)';
        statusBadge.style.color = '#28a745';
    }
});

toggleBtn.onclick = () => {
    const data = JSON.parse(localStorage.getItem('donorInfo'));
    isOnline = !isOnline;
    if (isOnline) {
        socket.emit('donorOnline', data.phone);
        statusBadge.innerText = 'Online';
        statusBadge.className = 'status-badge online';
        toggleBtn.innerText = 'Go Offline';
    } else {
        window.location.reload();
    }
};

// --- WebRTC LOGIC ---
let peerConnection;
let localStream;
let donorSocketId;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startWebRTCCall(phone, name) {
    document.getElementById('callOverlay').classList.remove('hidden');
    document.getElementById('callTarget').innerText = name;
    document.getElementById('callStatus').innerText = 'Requesting...';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

        peerConnection.ontrack = (e) => {
            document.getElementById('remoteAudio').srcObject = e.streams[0];
            document.getElementById('callStatus').innerText = 'Connected';
        };

        peerConnection.onicecandidate = (e) => {
            if (e.candidate && donorSocketId) {
                socket.emit('iceCandidate', { to: donorSocketId, candidate: e.candidate });
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('callUser', {
            donorPhone: phone,
            signalData: offer,
            callerName: 'Someone'
        });
    } catch (err) {
        alert('Mic access denied');
        endCall();
    }
}

socket.on('callAccepted', async (data) => {
    donorSocketId = data.donorSocket;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
});

socket.on('callError', (data) => {
    alert(data.message);
    endCall();
});

socket.on('incomingCall', async ({ signal, from, callerSocket }) => {
    document.getElementById('incomingModal').classList.remove('hidden');
    document.getElementById('callerInfo').innerText = `From: ${from}`;

    document.getElementById('btnAccept').onclick = async () => {
        document.getElementById('incomingModal').classList.add('hidden');
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTarget').innerText = from;
        document.getElementById('callStatus').innerText = 'Connecting...';

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

        peerConnection.ontrack = (e) => {
            document.getElementById('remoteAudio').srcObject = e.streams[0];
            document.getElementById('callStatus').innerText = 'Connected';
        };

        peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('iceCandidate', { to: callerSocket, candidate: e.candidate });
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answerCall', { signal: answer, to: callerSocket });
    };

    document.getElementById('btnDecline').onclick = () => {
        document.getElementById('incomingModal').classList.add('hidden');
    };
});

socket.on('iceCandidate', (cand) => {
    if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(cand));
});

function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    document.getElementById('callOverlay').classList.add('hidden');
}

// Initial Init
checkAuth();
showPage('home');
