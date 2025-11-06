(function() {
    const navigation = document.createElement('div');
    navigation.className = 'navigation';
    navigation.innerHTML = `
    <div class="toggle"></div>
    <div class="screen chat-screen">
    <div class="messages" id="messages"></div>
    <div class="typebox">
    <input type="text" id="message-input" placeholder="Type a message...">
    <button id="send-message">Send</button>
    </div>
    </div>
    `;
    document.body.appendChild(navigation);

    const toggle = navigation.querySelector('.toggle');
    let isDragging = false;

    // Restore toggle open state
    const savedToggle = sessionStorage.getItem('chatToggle') === 'true';
    if (savedToggle) {
        toggle.classList.add('active');
        navigation.classList.add('active');
    }

    // --- Toggle click handler with drag prevention ---
    let clickTimeout;

    toggle.addEventListener('mousedown', () => {
        clickTimeout = setTimeout(() => {
            isDragging = true; // long hold counts as drag
        }, 150);
    });

    toggle.addEventListener('mouseup', () => {
        clearTimeout(clickTimeout);

        if (!isDragging) {
            toggle.classList.toggle('active');
            navigation.classList.toggle('active');
            sessionStorage.setItem('chatToggle', toggle.classList.contains('active'));
        }

        isDragging = false; // reset
    });

    // --- Draggable with saved position ---
    $(function() {
        const savedLeft = parseInt(sessionStorage.getItem('chatLeft'), 10);
        const savedTop = parseInt(sessionStorage.getItem('chatTop'), 10);

        if (!isNaN(savedLeft) && !isNaN(savedTop)) {
            navigation.style.left = savedLeft + 'px';
            navigation.style.top = savedTop + 'px';
            navigation.style.bottom = 'auto';
            navigation.style.right = 'auto';
        } else {
            navigation.style.bottom = '20px';
            navigation.style.right = '20px';
        }

        $(".navigation").draggable({
            distance: 5,  // prevents accidental clicks while moving
            start: function() { isDragging = true; },
                                   stop: function(event, ui) {
                                       isDragging = false;
                                       sessionStorage.setItem('chatLeft', ui.position.left);
                                       sessionStorage.setItem('chatTop', ui.position.top);
                                       navigation.style.bottom = 'auto';
                                       navigation.style.right = 'auto';
                                   }
        });
    });

    // --- Chat logic ---
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-message');

    let conversation = JSON.parse(sessionStorage.getItem('chatConversation')) || [];

    function renderConversation() {
        messagesDiv.innerHTML = '';
        conversation.forEach(msg => addMessage(msg.user, msg.text, false));
    }

    function addMessage(sender, text, save = true) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message', sender === 'You' ? 'my-message' : 'bot-message');
        msgDiv.innerHTML = `<div class="name">${sender}</div><div class="text">${text}</div>`;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        if (save) {
            conversation.push({ user: sender, text: text });
            sessionStorage.setItem('chatConversation', JSON.stringify(conversation));
        }
    }

    // --- Handle Bot Response ---
    async function handleBotResponse(text) {
        const apiUrl = "https://nodejs-serverless-function-express-84ti1khnz-clefmaels-projects.vercel.app/api/hello";
        try {
            const loadingMsg = document.createElement('div');
            loadingMsg.classList.add('message', 'bot-message');
            loadingMsg.innerHTML = `<div class="name">Bot</div><div class="text">...</div>`;
            messagesDiv.appendChild(loadingMsg);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            const response = await fetch(`${apiUrl}?q=${encodeURIComponent(text)}`);
            const data = await response.json();

            messagesDiv.removeChild(loadingMsg);
            addMessage("Bot", data.answer || "I couldn't find an answer 😅");
        } catch (err) {
            console.error(err);
            addMessage("Bot", "Something went wrong 😅");
        }
    }

    sendBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (!text) return;
        addMessage('You', text);
        input.value = '';
        handleBotResponse(text);
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });

        renderConversation();
})();
