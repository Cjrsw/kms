"use client";

import { useState } from "react";

type AuthorAutocompleteInputProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  suggestions: string[];
};

export function AuthorAutocompleteInput({
  name,
  defaultValue = "",
  placeholder,
  suggestions,
}: AuthorAutocompleteInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const normalized = value.trim().toLowerCase();

  const filteredSuggestions = suggestions
    .filter((item) => {
      if (!normalized) return true;
      return item.toLowerCase().includes(normalized);
    })
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        className="kms-cyber-input"
        name={name}
        onBlur={() => setTimeout(() => setIsOpen(false), 100)}
        onChange={(event) => {
          setValue(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {isOpen && filteredSuggestions.length > 0 ? (
        <div className="kms-author-suggestions">
          {filteredSuggestions.map((item) => (
            <button
              className="kms-author-suggestion"
              key={item}
              onMouseDown={(event) => {
                event.preventDefault();
                setValue(item);
                setIsOpen(false);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
