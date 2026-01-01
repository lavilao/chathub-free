import { v4 as uuidv4 } from 'uuid'
import { ChatError, ErrorCode } from '~utils/errors'

export async function fetchConversationId(): Promise<string> {
  let resp: Response
  try {
    resp = await fetch('https://www.kimi.com/api/chat/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: uuidv4() }),
    })
  } catch (err) {
    console.error(err)
    throw new ChatError('Kimi webapp not available in your country', ErrorCode.KIMI_WEB_UNAVAILABLE)
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new ChatError('There is no logged-in Kimi account in this browser.', ErrorCode.KIMI_WEB_UNAUTHORIZED)
  }

  const data = await resp.json()
  return data.id
}

export async function checkConversationExists(conversationId: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://www.kimi.com/api/chat/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return resp.ok
  } catch {
    return false
  }
}
