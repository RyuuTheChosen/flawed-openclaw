export type AgentPhase = "idle" | "thinking" | "speaking" | "working";

export type AgentState = {
	phase: AgentPhase;
	text?: string;
	agentId?: string;
};
