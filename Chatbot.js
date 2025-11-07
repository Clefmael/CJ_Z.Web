$(function() {
    // --- Create chat container ---
    const $nav = $('<div class="navigation"></div>').html(`
        <div class="toggle"></div>
        <div class="screen chat-screen">
            <div class="messages" id="messages"></div>
            <div class="typebox">
                <input type="text" id="message-input" placeholder="Type a message...">
                <button id="send-message">Send</button>
            </div>
        </div>
    `).appendTo('body');

    const $toggle = $nav.find('.toggle');

    // Restore toggle open state
    if (sessionStorage.getItem('chatToggle') === 'true') {
        $toggle.addClass('active');
        $nav.addClass('active');
    }

    // Restore saved position
    const savedLeft = parseInt(sessionStorage.getItem('chatLeft'), 10);
    const savedTop = parseInt(sessionStorage.getItem('chatTop'), 10);

    if (!isNaN(savedLeft) && !isNaN(savedTop)) {
        $nav.css({ left: savedLeft + 'px', top: savedTop + 'px', bottom: 'auto', right: 'auto' });
    } else {
        $nav.css({ bottom: '20px', right: '20px' });
    }

    // --- Draggable with drag detection ---
    let isDragging = false;

    $nav.draggable({
        distance: 5,
        start: function() {
            isDragging = true;
        },
        stop: function(event, ui) {
            sessionStorage.setItem('chatLeft', ui.position.left);
            sessionStorage.setItem('chatTop', ui.position.top);
            $nav.css({ bottom: 'auto', right: 'auto' });

            // Delay reset so click doesn't trigger toggle after drag
            setTimeout(() => { isDragging = false; }, 10);
        }
    });

    // --- Toggle click ---
    $toggle.on('click', function() {
        if (isDragging) return; // prevent toggle if dragging
        $toggle.toggleClass('active');
        $nav.toggleClass('active');
        sessionStorage.setItem('chatToggle', $toggle.hasClass('active'));
    });

    // --- Chat logic ---
    const $messages = $nav.find('#messages');
    const $input = $nav.find('#message-input');
    const $sendBtn = $nav.find('#send-message');

    let conversation = JSON.parse(sessionStorage.getItem('chatConversation')) || [];

    function renderConversation() {
        $messages.empty();
        conversation.forEach(msg => addMessage(msg.user, msg.text, false));
    }

    function addMessage(sender, text, save = true) {
        const $msg = $(`
            <div class="message ${sender === 'You' ? 'my-message' : 'bot-message'}">
                <div class="name">${sender}</div>
                <div class="text">${text}</div>
            </div>
        `);
        $messages.append($msg);
        $messages.scrollTop($messages[0].scrollHeight);

        if (save) {
            conversation.push({ user: sender, text });
            sessionStorage.setItem('chatConversation', JSON.stringify(conversation));
        }
    }

   async function handleBotResponse(text) {
    try {
        const $loading = $('<div class="message bot-message"><div class="name">Bot</div><div class="text">...</div></div>');
        $messages.append($loading);
        $messages.scrollTop($messages[0].scrollHeight);

        // Call the backend on the same domain
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        });

        const data = await res.json();
        $loading.remove();
        addMessage("Bot", data.answer || "I couldn't find an answer 😅");
    } catch {
        addMessage("Bot", "Something went wrong 😅");
    }
}



    $sendBtn.on('click', () => {
        const text = $input.val().trim();
        if (!text) return;
        addMessage('You', text);
        $input.val('');
        handleBotResponse(text);
    });

    $input.on('keypress', e => {
        if (e.key === 'Enter') $sendBtn.click();
    });

    renderConversation();
});
