import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Custom Component Schemas for Thesys C1
 *
 * These schemas tell C1 about the custom React components available
 * on the frontend. When C1 wants to render interactive forms,
 * it can use these custom components instead of the built-in ones.
 */

// Option schema used by both radio and checkbox groups
const OptionSchema = z.object({
  label: z.string().describe("Display text shown to the user"),
  value: z.string().describe("Internal value sent when selected"),
  description: z
    .string()
    .optional()
    .describe("Optional helper text explaining this option"),
});

/**
 * EditableRadioGroup Schema
 *
 * Use this for single-choice questions where the user should select one option.
 * When the user selects an option, they can edit the response before sending.
 */
const EditableRadioGroupSchema = z
  .object({
    question: z
      .string()
      .describe("The question or prompt to display above the options"),
    options: z
      .array(OptionSchema)
      .describe("Array of options for the user to choose from"),
    name: z
      .string()
      .optional()
      .describe("Optional name for the radio group (for form handling)"),
  })
  .describe(
    "An interactive radio button group for single-selection questions. " +
      "Use this when you want the user to pick ONE option from a list. " +
      "The user can review and edit their response before it is sent. " +
      "Great for surveys, preference selection, or any mutually exclusive choices."
  );

/**
 * EditableCheckboxGroup Schema
 *
 * Use this for multi-choice questions where the user can select multiple options.
 * When the user changes selections, they can edit the response before sending.
 */
const EditableCheckboxGroupSchema = z
  .object({
    question: z
      .string()
      .describe("The question or prompt to display above the options"),
    options: z
      .array(OptionSchema)
      .describe("Array of options the user can select (multiple allowed)"),
    name: z
      .string()
      .optional()
      .describe("Optional name for the checkbox group (for form handling)"),
  })
  .describe(
    "An interactive checkbox group for multi-selection questions. " +
      "Use this when the user can select MULTIPLE options from a list. " +
      "The user can review and edit their response before it is sent. " +
      "Great for multi-select surveys, feature preferences, or any non-exclusive choices."
  );

/**
 * Export the custom component schemas as JSON schemas
 * These are passed to the C1 API via metadata.thesys.c1_custom_components
 */
export const CUSTOM_COMPONENT_SCHEMAS = {
  EditableRadioGroup: zodToJsonSchema(EditableRadioGroupSchema),
  EditableCheckboxGroup: zodToJsonSchema(EditableCheckboxGroupSchema),
};



