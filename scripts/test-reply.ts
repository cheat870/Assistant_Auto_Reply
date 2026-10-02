import { autoReplyService } from '../src/services/autoReply.service.js';

async function test() {
  const result = await autoReplyService.findReply('nv');
  console.log('Test result for "nv":');
  console.log('Reply:', result?.reply);
  console.log('Match type:', result?.matchType);
}

test().catch(console.error);
