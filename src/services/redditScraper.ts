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
  private baseUrl = 'https://www.reddit.com';
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  extractUsername(profileUrl: string): string | null {
    const match = profileUrl.match(new RegExp('reddit//.com/(?:u|user)/([^/?]+)', 'i'));
    return match ? match[1] : null;
  }

  async fetchUserInfo(username: string): Promise<RedditUserInfo | null> {
    console.log(`[RedditScraper] Fetching info for u/${username}`);
    
    // Method 1: Reddit's public JSON API (most reliable)
    try {
      console.log(`[RedditScraper] Trying Reddit JSON API for u/${username}`);
      const url = `https://www.reddit.com/user/${username}/about.json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        redirect: 'follow',
      });

      console.log(`[RedditScraper] Reddit API response: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data: any = await response.json();
        if (data.data) {
          console.log(`[RedditScraper] Successfully fetched via Reddit JSON API`);
          return {
            name: data.data.name,
            link_karma: data.data.link_karma || 0,
            comment_karma: data.data.comment_karma || 0,
            created_utc: data.data.created_utc || 0,
            id: data.data.id || username,
          };
        }
      } else {
        console.log(`[RedditScraper] Reddit API failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Reddit JSON API error:', error);
    }

    // Fallback: Try old.reddit.com JSON endpoint
    try {
      console.log(`[RedditScraper] Trying old.reddit.com JSON API for u/${username}`);
      const url = `https://old.reddit.com/user/${username}/about.json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        redirect: 'follow',
      });

      console.log(`[RedditScraper] Old Reddit API response: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data: any = await response.json();
        if (data.data) {
          console.log(`[RedditScraper] Successfully fetched via old.reddit.com JSON API`);
          return {
            name: data.data.name,
            link_karma: data.data.link_karma || 0,
            comment_karma: data.data.comment_karma || 0,
            created_utc: data.data.created_utc || 0,
            id: data.data.id || username,
          };
        }
      } else {
        console.log(`[RedditScraper] Old Reddit API failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Old Reddit JSON API error:', error);
    }

    // Fallback: Scrape old.reddit.com HTML
    try {
      console.log(`[RedditScraper] Trying HTML scrape for u/${username}`);
      const url = `https://old.reddit.com/user/${username}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
      });

      console.log(`[RedditScraper] HTML scrape response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        if (response.status === 403) {
          console.log('[RedditScraper] Got 403 - likely blocked or private profile');
          throw new Error('Profile may be private or Reddit is blocking requests');
        }
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseUserInfo(html, username);
    } catch (error) {
      console.error('HTML scraper error:', error);
    }

    console.log(`[RedditScraper] All methods failed for u/${username}`);
    return null;
  }

  private parseUserInfo(html: string, username: string): RedditUserInfo | null {
    try {
      let totalKarma = 0;
      let createdUtc = 0;

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