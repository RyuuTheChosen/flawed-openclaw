import { createChatBubble } from "../ui/chat-bubble.js";

const bridge = window.chatBridge;

const chatBody = document.getElementById("chat-body")!;

const chatBubble = createChatBubble(chatBody, bridge, {
	onVisibilityChange(visible) {
		if (visible) {
			bridge.notifyContentShown();
		} else {
			bridge.notifyContentHidden();
		}
	},
});

// Receive agent state from main process
bridge.onAgentState((state) => {
	chatBubble.handleAgentState(state);
});

// Show bubble when window becomes visible (after idle hide)
bridge.onShowBubble(() => {
	chatBubble.show();
});
