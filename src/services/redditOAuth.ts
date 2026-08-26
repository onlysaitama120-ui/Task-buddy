import { getConfig } from '../config';

export interface RedditUserInfo {
  name: string;
  link_karma: number;
  comment_karma: number;
  created_utc: number;
  id: string;
}

export interface RedditTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class RedditOAuthService {
  private config = getConfig();
  private baseUrl = 'https://www.reddit.com';
  private oauthUrl = 'https://www.reddit.com/api/v1';

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.REDDIT_CLIENT_ID,
      response_type: 'code',
      state,
      redirect_uri: this.config.REDDIT_REDIRECT_URI,
      duration: 'permanent',
      scope: 'identity',
    });
    return `${this.oauthUrl}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code: string): Promise<RedditTokens> {
    const auth = Buffer.from(`${this.config.REDDIT_CLIENT_ID}:${this.config.REDDIT_CLIENT_SECRET}`).toString('base64');
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.REDDIT_REDIRECT_URI,
    });

    const response = await fetch(`${this.oauthUrl}/access_token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Task-buddy/1.0',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    return response.json() as Promise<RedditTokens>;
  }

  /**
   * Fetch authenticated user info from Reddit
   */
  async getUserInfo(accessToken: string): Promise<RedditUserInfo> {
    const response = await fetch(`${this.oauthUrl}/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Task-buddy/1.0',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch user info: ${error}`);
    }

    const data: any = await response.json();
    return {
      name: data.name,
      link_karma: data.link_karma,
      comment_karma: data.comment_karma,
      created_utc: data.created_utc,
      id: data.id,
    };
  }

  /**
   * Verify user meets requirements
   */
  verifyUser(userInfo: RedditUserInfo, minKarma: number, minAccountAgeDays: number): { verified: boolean; reason?: string } {
    const totalKarma = userInfo.link_karma + userInfo.comment_karma;
    const accountAgeDays = Math.floor((Date.now() / 1000 - userInfo.created_utc) / 86400);

    if (totalKarma < minKarma) {
      return { verified: false, reason: `Insufficient karma. Required: ${minKarma}, Current: ${totalKarma}` };
    }

    if (accountAgeDays < minAccountAgeDays) {
      return { verified: false, reason: `Account too new. Required: ${minAccountAgeDays} days, Current: ${accountAgeDays} days` };
    }

    return { verified: true };
  }
}