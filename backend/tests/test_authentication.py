
from playwright.sync_api import Page, expect

# TC-01: Customer registration
def test_customer_registration(page: Page):
    page.goto("https://table-flow-delta.vercel.app/account/sign-up")

    # Enter valid customer details
    # Click the Register button
    # Verify successful account creation


# TC-02: Invalid login
def test_invalid_login(page: Page):
    page.goto("https://table-flow-delta.vercel.app/account/sign-in")

    # Enter invalid username and password
    # Click Login
    # Verify that login is rejected


# TC-03: Customer authorization
def test_customer_staff_access(page: Page):
    page.goto("https://table-flow-delta.vercel.app/account/sign-in")

    # Login as a customer
    # Attempt to access a staff-only page
    # Verify access is denied
