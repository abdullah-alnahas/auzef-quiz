"""Characterisation tests for HTML text extraction shared by both parsers."""
from bs4 import BeautifulSoup

from parse_exam import clean, text_of


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def test_br_tags_become_newlines():
    assert text_of(soup("<p>bir<br>iki</p>")) == "bir\niki"


def test_literal_br_markup_is_a_newline_not_words():
    assert clean("bir<br>iki") == "bir\niki"
    assert clean("bir<br/>iki") == "bir\niki"
    assert clean("bir<br />iki") == "bir\niki"


def test_block_children_are_separated_and_scripts_dropped():
    assert text_of(soup("<div><p>bir</p><p>iki</p><script>x</script></div>")) == "bir\n\niki"


def test_images_are_ignored_in_text():
    assert text_of(soup('<p>bir<img src="x">iki</p>')) == "biriki"


def test_whitespace_is_normalised_but_words_are_untouched():
    assert clean("  bir \t iki\r\nüç  ") == "bir \t iki\nüç"
    assert clean("a\n\n\n\nb") == "a\n\nb"
