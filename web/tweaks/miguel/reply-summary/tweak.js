export default function setup(api) {
  // The switch is CSS (--wos-reply-summary: on); the host removes it on teardown and Chats repaints without it.
  return () => {};
}
