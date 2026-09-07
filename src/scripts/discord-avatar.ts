import { DISCORD_USER_ID } from "../config";

/**
 * Swaps the fallback profile picture and favicon for JayJayzzzzzz's current
 * Discord avatar, fetched through the Lanyard API. Any failure leaves the
 * fallback in place silently.
 */

const LANYARD_USER_ENDPOINT = "https://api.lanyard.rest/v1/users";
const DISCORD_CDN = "https://cdn.discordapp.com/avatars";

interface LanyardResponse {
  success: boolean;
  data?: {
    discord_user?: {
      id: string;
      avatar: string | null;
    };
  };
}

export function initDiscordAvatar(): void {
  const avatar = document.getElementById("avatar") as HTMLImageElement | null;
  const favicon = document.getElementById("favicon") as HTMLLinkElement | null;

  if (!avatar || !/^\d{17,20}$/.test(DISCORD_USER_ID)) return;

  fetch(`${LANYARD_USER_ENDPOINT}/${DISCORD_USER_ID}`)
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((body: LanyardResponse) => {
      const user = body.success ? body.data?.discord_user : undefined;
      if (!user?.avatar) return;

      const base = `${DISCORD_CDN}/${user.id}/${user.avatar}`;
      const extension = user.avatar.startsWith("a_") ? "gif" : "png";

      swapWhenLoaded(avatar, `${base}.${extension}?size=512`);

      if (favicon) {
        favicon.type = "image/png";
        favicon.href = `${base}.png?size=128`;
      }
    })
    .catch(() => {
      /* keep the fallback avatar */
    });
}

/** Only replace the visible image once the new one has actually decoded. */
function swapWhenLoaded(image: HTMLImageElement, src: string): void {
  const preload = new Image();
  preload.addEventListener("load", () => {
    image.src = src;
  });
  preload.src = src;
}
