import axios from 'axios';
import { config } from '../config/index.js';
import { CloudflaredStatus, ToolResult } from '../types/index.js';

export async function getCloudflaredStatus(): Promise<ToolResult<CloudflaredStatus>> {
  if (!config.cloudflare.apiToken) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Cloudflare API token not configured (CLOUDFLARE_API_TOKEN)',
    };
  }

  const headers = {
    Authorization: `Bearer ${config.cloudflare.apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // Get account info first to extract account_id
    const verifyRes = await axios.get(`${config.cloudflare.baseUrl}/user/tokens/verify`, {
      headers,
      timeout: 8000,
    });

    if (!verifyRes.data.success) {
      throw new Error('API token verification failed');
    }

    // List tunnels for the zone's account
    // If CLOUDFLARE_ZONE_ID is set, we can get zone details to find account_id
    let tunnelData: CloudflaredStatus = {
      running: true,
      accountTag: undefined,
      tunnels: [],
    };

    if (config.cloudflare.zoneId) {
      const zoneRes = await axios.get(
        `${config.cloudflare.baseUrl}/zones/${config.cloudflare.zoneId}`,
        { headers, timeout: 8000 }
      );

      if (zoneRes.data.success) {
        const accountId = zoneRes.data.result.account.id;
        tunnelData.accountTag = accountId;

        // List cfd tunnels
        const tunnelsRes = await axios.get(
          `${config.cloudflare.baseUrl}/accounts/${accountId}/cfd_tunnel?is_deleted=false`,
          { headers, timeout: 8000 }
        );

        if (tunnelsRes.data.success) {
          tunnelData.tunnels = tunnelsRes.data.result.map((t: any) => ({
            id: t.id,
            name: t.name,
            status: t.status,
            connections: t.connections?.length || 0,
          }));
          tunnelData.running = tunnelData.tunnels?.some(t => t.status === 'healthy') ?? false;
        }
      }
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: tunnelData,
    };
  } catch (error: any) {
    const msg = error.response
      ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`
      : error.message;
    return {
      success: false,
      timestamp: new Date().toISOString(),
      data: { running: false, error: msg },
      error: `Cloudflare API Error: ${msg}`,
    };
  }
}
