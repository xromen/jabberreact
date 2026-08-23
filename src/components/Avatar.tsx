import { avatarColor, initials } from "../lib/display";
import type { Contact } from "../types";

type AvatarProps = {
  name: string;
  presence: Contact["presence"];
  large?: boolean;
};

export function Avatar({ name, presence, large = false }: AvatarProps) {
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
      <i className={`presence ${presence}`} aria-hidden="true" />
    </span>
  );
}
