declare module "prompts" {
  export interface Choice<T = string> {
    title: string;
    value: T;
    description?: string;
  }

  export interface PromptObject {
    type: "text" | "select" | "toggle" | "confirm" | "number" | "multiselect";
    name: string;
    message: string;
    initial?: any;
    choices?: Choice[];
    active?: string;
    inactive?: string;
  }

  export type PromptArray = PromptObject[];

  export interface Options {
    onCancel?: () => void;
    onSubmit?: () => void;
  }

  export default function prompts<T extends Record<string, any>>(
    questions: PromptArray,
    options?: Options
  ): Promise<T>;
}