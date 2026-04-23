import getReadingTime from 'reading-time';
import { toString } from 'mdast-util-to-string';

export function remarkReadingTime() {
  return function (tree, { data }) {
    const textOnPage = toString(tree);
    const readingTime = getReadingTime(textOnPage);

    // Check if the remark plugin has access to data.astro.frontmatter
    data.astro.frontmatter.readingTime = readingTime.text;
  };
}
