export default {
  async fetch(request, env) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown"

    const { success } = await env.MY_RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return new Response("429 Too Many Requests", { status: 429 })
    }

    return new Response("Success")
  }
}
