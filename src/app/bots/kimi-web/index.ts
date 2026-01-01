import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'
import { checkConversationExists, fetchConversationId } from './api'
import { requestHostPermission } from '~app/utils/permissions'
import { ChatError, ErrorCode } from '~utils/errors'

interface ConversationContext {
  conversationId: string
  lastMessageId: string
}

export class KimiWebBot extends AbstractBot {
  private conversationContext?: ConversationContext

  constructor() {
    super()
  }

  async doSendMessage(params: SendMessageParams): Promise<void> {
    if (!(await requestHostPermission('https://www.kimi.com/'))) {
      throw new ChatError('Missing kimi.com permission', ErrorCode.MISSING_HOST_PERMISSION)
    }

    if (!this.conversationContext) {
      // Try to create a new conversation
      this.conversationContext = {
        conversationId: await fetchConversationId(),
        lastMessageId: '',
      }
    }

    const resp = await fetch('https://www.kimi.com/api/chat', {
      method: 'POST',
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: this.conversationContext.conversationId,
        parent_message_id: this.conversationContext.lastMessageId || undefined,
        prompt: params.prompt,
      }),
    })

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        // Reset conversation context for auth errors
        this.conversationContext = undefined
        throw new ChatError('There is no logged-in Kimi account in this browser.', ErrorCode.KIMI_WEB_UNAUTHORIZED)
      }
      if (resp.status === 404) {
        // Conversation not found, reset and try again
        this.conversationContext = undefined
        throw new ChatError('Conversation not found. Please try again.', ErrorCode.KIMI_WEB_CONVERSATION_NOT_FOUND)
      }
      throw new ChatError(`Kimi API error: ${resp.status}`, ErrorCode.UNKOWN_ERROR)
    }

    let result = ''
    let messageId = ''

    await parseSSEResponse(resp, (message) => {
      console.debug('kimi sse message', message)
      try {
        const payload = JSON.parse(message)

        if (payload.message_id) {
          messageId = payload.message_id
        }

        if (payload.choices && payload.choices[0] && payload.choices[0].delta && payload.choices[0].delta.content) {
          result += payload.choices[0].delta.content
          params.onEvent({
            type: 'UPDATE_ANSWER',
            data: { text: result.trimStart() },
          })
        } else if (payload.error) {
          throw new Error(JSON.stringify(payload.error))
        }
      } catch (err) {
        console.debug('Failed to parse SSE message:', message, err)
      }
    })

    // Update conversation context with the last message ID
    if (messageId && this.conversationContext) {
      this.conversationContext.lastMessageId = messageId
    }

    params.onEvent({ type: 'DONE' })
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return 'Kimi (webapp)'
  }
}
