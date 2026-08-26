import { getConfig } from '../config';

export interface RedditUserInfo {
  name: string;
  link_karma: number;
  comment_karma: number;
  created_utc: number;
  id: string;
}

export class RedditScraperService {
  private config = getConfig();
  private baseUrl = 'https://old.reddit.com';
  private userAgent = 'Task-buddy/1.0';

  extractUsername(profileUrl: string): string | null {
    const match = profileUrl.match(new RegExp("reddit////.com///u///([^/?]+)", "i"));
    return match ? match[1] : null;
  }

  async fetchUserInfo(username: string): Promise<RedditUserInfo | null> {
    try {
      const url = `${this.baseUrl}/user/${username}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const html = await response.text();
      return this.parseUserInfo(html, username);
    } catch (error) {
      console.error('Scraper error:', error);
      return null;
    }
  }

  private parseUserInfo(html: string, username: string): RedditUserInfo | null {
    try {
      let totalKarma = 0;
      let linkKarma = 0;
      let commentKarma = 0;

      // Try JSON-LD structured data
      const jsonLdStart = html.indexOf('<script type="application/ld+json">');
      const jsonLdEnd = html.indexOf('</script>', jsonLdStart);
      const jsonLdMatch = jsonLdStart !== -1 && jsonLdEnd !== -1 
        ? [html.slice(jsonLdStart, jsonLdEnd + 9)] 
        : null;
      
      if (jsonLdMatch) {
        try {
          const jsonData = JSON.parse(jsonLdMatch[1]);
          if (jsonData.karma) totalKarma = jsonData.karma;
        } catch {}
      }

      // Try to find karma in HTML elements
      const karmaMatches = html.match(new RegExp("karma[^>]*>([0-9,]+)<", "gi"));
      if (karmaMatches && karmaMatches.length > 0) {
        const karmaStr = karmaMatches[0].match(new RegExp("([0-9,]+)"));
        if (karmaStr) totalKarma = parseInt(karmaStr[1].replace(/,/g, ''), 10);
      }

      // Try to find account creation date
      let createdUtc = 0;
      const cakeDayMatch = html.match(new RegExp("cake day[^>]*>([^<]+)<", "i"));
      if (cakeDayMatch) {
        const dateStr = cakeDayMatch[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          createdUtc = Math.floor(date.getTime() / 1000);
        }
      }

      const redditorMatch = html.match(new RegExp("redditor for ([/d.]+)//s*(year|month|day)", "i"));
      if (redditorMatch && !createdUtc) {
        const value = parseFloat(redditorMatch[1]);
        const unit = redditorMatch[2].toLowerCase();
        let days = 0;
        if (unit.startsWith('year')) days = value * 365;
        else if (unit.startsWith('month')) days = value * 30;
        else days = value;
        createdUtc = Math.floor(Date.now() / 1000) - days * 86400;
      }

      if (totalKarma === 0 && !createdUtc) {
        return null;
      }

      return {
        name: username,
        link_karma: Math.floor(totalKarma / 2),
        comment_karma: Math.floor(totalKarma / 2),
        created_utc: createdUtc || Math.floor(Date.now() / 1000) - 365 * 86400,
        id: username,
      };
    } catch (error) {
      console.error('Parse error:', error);
      return null;
    }
  }

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