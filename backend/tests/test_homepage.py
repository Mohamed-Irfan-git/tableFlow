
from playwright.sync_api import Page, expect

def test_homepage(page: Page):
    page.goto("https://table-flow-delta.vercel.app/")

    # Check whether the homepage loads
    expect(page.locator("body")).to_be_visible()

    print("TableFlow homepage loaded successfully")
