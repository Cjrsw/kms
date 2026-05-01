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
        className="block w-full rounded-lg border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-700 outline-none transition-colors hover:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filteredSuggestions.map((item) => (
            <button
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-blue-50"
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
