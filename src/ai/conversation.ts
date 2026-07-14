export function conversationConfig(waId: string) {
  return {
    configurable: { thread_id: waId },
    metadata: { thread_id: waId },
  };
}
