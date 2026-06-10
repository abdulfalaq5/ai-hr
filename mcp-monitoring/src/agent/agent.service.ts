import OpenAI from 'openai';
import { config } from '../config/index.js';
import { getCpuUsage } from '../tools/cpu.js';
import { getMemoryUsage } from '../tools/memory.js';
import { getDiskUsage } from '../tools/disk.js';
import { getNetworkStatus } from '../tools/network.js';
import { getDockerContainers, getDockerStats } from '../tools/docker.js';
import { getPostgresStatus } from '../tools/postgres.js';
import { getRabbitMQStatus } from '../tools/rabbitmq.js';
import { getNginxStatus } from '../tools/nginx.js';
import { getCloudflaredStatus } from '../tools/cloudflare.js';
import { readRecentLogs } from '../tools/logs.js';

export class AgentService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseUrl,
    });
  }

  // Definisi schema untuk tools OpenAI
  private get tools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      { type: 'function', function: { name: 'get_cpu_usage', description: 'Get current CPU usage and load average' } },
      { type: 'function', function: { name: 'get_memory_usage', description: 'Get current RAM usage and free memory' } },
      { type: 'function', function: { name: 'get_disk_usage', description: 'Get disk usage statistics' } },
      { type: 'function', function: { name: 'get_network_status', description: 'Get network interface statistics' } },
      { type: 'function', function: { name: 'get_docker_containers', description: 'List all running Docker containers' } },
      {
        type: 'function',
        function: {
          name: 'get_docker_stats',
          description: 'Get CPU/Memory stats for a specific Docker container',
          parameters: {
            type: 'object',
            properties: { containerId: { type: 'string', description: 'ID or Name of the container' } },
            required: ['containerId']
          }
        }
      },
      { type: 'function', function: { name: 'get_postgres_status', description: 'Check PostgreSQL connection status and basic metrics' } },
      { type: 'function', function: { name: 'get_rabbitmq_status', description: 'Check RabbitMQ cluster status and queues' } },
      { type: 'function', function: { name: 'get_nginx_status', description: 'Check Nginx status and active connections' } },
      { type: 'function', function: { name: 'get_cloudflared_status', description: 'Check Cloudflare tunnel status' } },
      {
        type: 'function',
        function: {
          name: 'read_recent_logs',
          description: 'Read recent log lines from allowed log files (e.g. syslog, auth, nginx, postgres)',
          parameters: {
            type: 'object',
            properties: {
              logFile: { type: 'string', description: 'Alias of the log file to read (syslog, auth, nginx, postgres)' },
              lines: { type: 'number', description: 'Number of lines to tail (default 50)' }
            },
            required: ['logFile']
          }
        }
      },
    ];
  }

  // Executor untuk memetakan nama tool ke fungsi aslinya
  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    try {
      switch (name) {
        case 'get_cpu_usage': return await getCpuUsage();
        case 'get_memory_usage': return await getMemoryUsage();
        case 'get_disk_usage': return await getDiskUsage();
        case 'get_network_status': return await getNetworkStatus();
        case 'get_docker_containers': return await getDockerContainers();
        case 'get_docker_stats': return await getDockerStats(); // actually doesn't take containerId in the original implementation
        case 'get_postgres_status': return await getPostgresStatus();
        case 'get_rabbitmq_status': return await getRabbitMQStatus();
        case 'get_nginx_status': return await getNginxStatus();
        case 'get_cloudflared_status': return await getCloudflaredStatus();
        case 'read_recent_logs': return await readRecentLogs({ logFile: args.logFile, lines: args.lines });
        default: return { error: `Tool ${name} not found` };
      }
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async ask(question: string): Promise<string> {
    if (!config.openai.apiKey) {
      return "Error: OPENAI_API_KEY is not configured in AI-Server.";
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are an AI Server Monitor agent. You have access to various system monitoring tools. Use them to answer the user question accurately. IMPORTANT: To be fast, you MUST call multiple tools AT THE SAME TIME (in parallel) if you need multiple pieces of data. Do NOT call them one by one. If asked for general server status, always call get_cpu_usage, get_memory_usage, get_disk_usage, and get_network_status in a single response.' },
      { role: 'user', content: question }
    ];

    try {
      let currentResponse = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages,
        tools: this.tools,
      });

      let responseMessage = currentResponse.choices[0].message;

      // Loop up to 5 times for sequential tool calls
      let loopCount = 0;
      while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && loopCount < 5) {
        messages.push(responseMessage); // Add assistant's tool call

        // Execute all tools requested in this step IN PARALLEL
        const toolPromises = responseMessage.tool_calls.map(async (toolCall) => {
          if (toolCall.type !== 'function') return null;
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

          console.log(`[AGENT] Executing tool: ${functionName} with args:`, functionArgs);
          const functionResult = await this.executeTool(functionName, functionArgs);

          return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: typeof functionResult === 'string' ? functionResult : JSON.stringify(functionResult, null, 2),
          };
        });

        const toolResults = await Promise.all(toolPromises);
        toolResults.forEach(result => {
          if (result) messages.push(result);
        });

        // Call LLM again with tool results
        currentResponse = await this.openai.chat.completions.create({
          model: config.openai.model,
          messages,
          tools: this.tools,
        });

        responseMessage = currentResponse.choices[0].message;
        loopCount++;
      }

      return responseMessage.content || "Gagal mendapatkan rangkuman.";

    } catch (error: any) {
      console.error('[AGENT] Error processing question:', error);
      return `Maaf, terjadi kesalahan internal saat memproses pertanyaan Anda: ${error.message}`;
    }
  }
}

export const agentService = new AgentService();
