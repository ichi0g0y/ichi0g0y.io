import { handleGitHubOAuthCallback, handleGitHubOAuthStart, handleLogout, handleRefresh, requireAuth } from './auth'
import {
  handleCreateGearFromUrl,
  handleDeleteGearItem,
  handleListGearItems,
  handlePreview,
  handleRenameGearCategory,
  handleReorderGearItems,
  handleTranslateGearDescription,
  handleUpdateGearItem,
} from './gear'
import { handleGetImageById } from './image-store'
import {
  handleTwitterOAuthCallback,
  handleTwitterOAuthStart,
  handleTwitterSettingsUpdate,
  handleTwitterStatus,
  handleTwitterTestPost,
} from './twitter-auth'
import { handleWithingsChartPng } from './withings-chart'
import type { Env } from './types'
import { appendCorsHeaders, errorResponse, preflightResponse } from './utils'
import {
  handleWithingsAuthCallback,
  handleWithingsAuthStart,
  handleWithingsNotify,
  handleWithingsStatus,
  handleWithingsSync,
} from './withings'

function isApiRequest(pathname: string) {
  return pathname.startsWith('/api/')
}

async function routeApi(request: Request, env: Env, ctx?: ExecutionContext) {
  const url = new URL(request.url)
  const pathname = url.pathname
  const pathnameWithoutTrailingSlash =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const method = request.method.toUpperCase()

  if (method === 'OPTIONS') {
    return preflightResponse(request, env)
  }

  if (method === 'GET' && pathname === '/api/auth/github/start') {
    return handleGitHubOAuthStart(request, env)
  }

  if (method === 'GET' && pathname === '/api/auth/github/callback') {
    return handleGitHubOAuthCallback(request, env)
  }

  if (method === 'POST' && pathname === '/api/auth/refresh') {
    return handleRefresh(request, env)
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    return handleLogout(request, env)
  }

  if (method === 'GET' && pathname === '/api/twitter/auth/callback') {
    return handleTwitterOAuthCallback(request, env)
  }

  if (method === 'GET' && pathname === '/api/admin/twitter/status') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTwitterStatus(env)
  }

  if (method === 'GET' && pathname === '/api/preview') {
    return handlePreview(request)
  }

  if (method === 'GET' && pathname === '/api/withings/status') {
    return handleWithingsStatus(env)
  }

  if (method === 'GET' && pathname === '/api/withings/chart.png') {
    return handleWithingsChartPng(request, env)
  }

  if (
    (method === 'GET' || method === 'POST' || method === 'HEAD') &&
    pathnameWithoutTrailingSlash === '/api/withings/auth/callback'
  ) {
    return handleWithingsAuthCallback(request, env, ctx)
  }

  if ((method === 'GET' || method === 'POST' || method === 'HEAD') && pathnameWithoutTrailingSlash === '/api/withings/notify') {
    return handleWithingsNotify(request, env, ctx)
  }

  if ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/api/images/')) {
    const response = await handleGetImageById(request, env)
    if (method === 'HEAD') {
      return new Response(null, { status: response.status, headers: response.headers })
    }
    return response
  }

  if (method === 'GET' && pathname === '/api/gear-items') {
    return handleListGearItems(env)
  }

  if (method === 'POST' && pathname === '/api/admin/gear-items/from-url') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleCreateGearFromUrl(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/gear-items/translate-description') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTranslateGearDescription(request, env)
  }

  if (method === 'PATCH' && pathname === '/api/admin/gear-items/reorder') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleReorderGearItems(request, env)
  }

  if (method === 'PATCH' && pathname === '/api/admin/gear-categories/rename') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleRenameGearCategory(request, env)
  }

  if (method === 'PATCH' && pathname.startsWith('/api/admin/gear-items/') && pathname !== '/api/admin/gear-items/reorder') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleUpdateGearItem(request, env)
  }

  if (method === 'DELETE' && pathname.startsWith('/api/admin/gear-items/')) {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleDeleteGearItem(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/withings/connect') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleWithingsAuthStart(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/twitter/connect') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTwitterOAuthStart(request, env)
  }

  if (method === 'PATCH' && pathname === '/api/admin/twitter/settings') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTwitterSettingsUpdate(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/twitter/test') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleTwitterTestPost(request, env)
  }

  if (method === 'POST' && pathname === '/api/admin/withings/sync') {
    const auth = await requireAuth(request, env)
    if (!auth) {
      return errorResponse('認証が必要です', 401)
    }
    return handleWithingsSync(env, request)
  }

  return errorResponse('APIが見つかりません', 404)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (isApiRequest(url.pathname)) {
      const response = await routeApi(request, env, ctx)
      return appendCorsHeaders(response, request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
