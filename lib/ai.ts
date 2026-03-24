// This is a simulated AI service.
// In a real app, you would call OpenAI, Claude, or a custom backend here.

const TOPIC_STARTERS = [
  "Have you considered how this affects daily routine?",
  "That's an interesting point! Can you elaborate on the benefits?",
  "Research suggests that engaging in this activity improves mental health.",
  "Many caregivers find this approach helpful.",
  "What are your thoughts on integrating this with existing care plans?",
  "This reminds me of a similar case study.",
];

export async function generateAIResponse(content: string): Promise<string> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const lower = content.toLowerCase();

  if (lower.includes("health") || lower.includes("medication")) {
    return "It's crucial to monitor health metrics closely. Have you checked the latest vitals?";
  }
  if (lower.includes("food") || lower.includes("diet")) {
    return "Nutrition plays a key role. What specific dietary needs are being addressed here?";
  }
  if (lower.includes("exercise") || lower.includes("walk")) {
    return "Physical activity is great for well-being! Remember to ensure safety during exercises.";
  }
  if (lower.includes("lonely") || lower.includes("sad")) {
    return "Social connection is vital. Have you tried scheduling a video call or a group activity?";
  }
  
  // Random fallback
  const random = TOPIC_STARTERS[Math.floor(Math.random() * TOPIC_STARTERS.length)];
  return `AI Insight: ${random}`;
}
