export class ProofService {
  static isValidRedditUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes("reddit.com") && parsed.pathname.includes("/comments/");
    } catch {
      return false;
    }
  }

  static extractCommentId(url: string): string | null {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/");
      const commentsIndex = parts.indexOf("comments");
      if (commentsIndex !== -1 && parts.length > commentsIndex + 3) {
        return parts[commentsIndex + 3];
      }
      return null;
    } catch {
      return null;
    }
  }

  static formatProofSubmittedMessage(payAmount: number): string {
    return "✅ Proof submitted!/n/n💰 Earned: $" + payAmount.toFixed(2) + "/nPayment due.";
  }

  static formatInvalidProofMessage(): string {
    return "❌ Invalid proof link./nPlease submit a valid Reddit URL.";
  }
}
