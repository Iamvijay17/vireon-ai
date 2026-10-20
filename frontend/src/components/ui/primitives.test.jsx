// Explicit React import: the test transform here does not apply the automatic JSX runtime
// the app build uses.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Meter } from "./Meter";
import { StatTile } from "./StatTile";
import { SegmentedControl } from "./SegmentedControl";
import { ChoiceGroup } from "./ChoiceGroup";
import { Select } from "./Select";
import { FormField } from "./FormField";
import { Input } from "./Input";
import { ProgressIndicator } from "./ProgressIndicator";

globalThis.React = React;

describe("Meter", () => {
  it("says Unavailable, and draws no fill, when the value could not be measured", () => {
    const { container } = render(<Meter label="VRAM" value={null} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(container.querySelector('[role="meter"] > div')).toBeNull();
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toBe("Unavailable");
  });

  it("shows a real zero as 0%, not as unavailable", () => {
    render(<Meter label="CPU" value={0} />);
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("uses the caller's display text and warns as the resource fills", () => {
    const { container } = render(<Meter label="VRAM" value={5500} max={6144} display="5.4 GB / 6.0 GB" />);
    expect(screen.getByText("5.4 GB / 6.0 GB")).toBeTruthy();
    expect(container.querySelector('[role="meter"] > div').className).toContain("bg-warning-500");
  });
});

describe("StatTile", () => {
  it("shows a dash, never 0, when there is no figure", () => {
    render(<StatTile label="Avg time" value={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("is a real button only when it does something", () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatTile label="Failed" value={2} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<StatTile label="Failed" value={2} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ProgressIndicator", () => {
  it("is indeterminate - not 0% - when the job reports no percentage", () => {
    render(<ProgressIndicator label="Rendering" />);
    expect(screen.getByRole("progressbar", { name: "Rendering" })).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "all", label: "All", count: 5 },
    { value: "failed", label: "Failed", count: 1 },
    { value: "done", label: "Done" },
  ];

  it("is one tab stop and marks the selection", () => {
    render(<SegmentedControl aria-label="Status" value="failed" onChange={() => {}} options={options} />);
    expect(screen.getByRole("radio", { name: /failed/i }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /^all/i }).getAttribute("tabindex")).toBe("-1");
  });

  it("moves and selects with the arrow keys, wrapping at the ends", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Status" value="done" onChange={onChange} options={options} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: /done/i }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

describe("ChoiceGroup", () => {
  const options = [
    { value: "a", label: "A" },
    { value: "b", label: "B", disabled: true, disabledReason: "Not for this type" },
    { value: "c", label: "C" },
  ];

  it("skips a disabled choice when arrowing", () => {
    const onChange = vi.fn();
    render(<ChoiceGroup aria-label="Pick" value="a" onChange={onChange} options={options} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("explains why a choice is disabled", () => {
    render(<ChoiceGroup aria-label="Pick" value="a" onChange={() => {}} options={options} />);
    const disabled = screen.getByRole("radio", { name: "B" });
    expect(disabled.hasAttribute("disabled")).toBe(true);
    expect(disabled.getAttribute("title")).toBe("Not for this type");
  });
});

describe("Select", () => {
  const options = [
    { value: "one", label: "One" },
    { value: "two", label: "Two" },
    { value: "three", label: "Three" },
  ];

  it("opens as a listbox from the keyboard and chooses with Enter", () => {
    const onChange = vi.fn();
    render(<Select aria-label="Number" value="one" onChange={onChange} options={options} />);
    const trigger = screen.getByRole("combobox", { name: "Number" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("two");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the current value as selected", () => {
    render(<Select aria-label="Number" value="two" onChange={() => {}} options={options} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /two/i }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("FormField", () => {
  it("ties the label, hint and error to the control for assistive tech", () => {
    render(
      <FormField label="Topic" hint="Be specific" error="Too short" required>
        <Input />
      </FormField>
    );
    const input = screen.getByLabelText(/topic/i);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-required")).toBe("true");
    const described = document.getElementById(input.getAttribute("aria-describedby"));
    // The error replaces the hint rather than stacking beside it.
    expect(described.textContent).toBe("Too short");
  });
});
