"""One-off seed script using the real BioClean catalogue (from the actual
factory company profile) rather than invented demo data - cost/wholesale
prices are a placeholder margin assumption, shelf locations and stock qty
are placeholder until the real physical layout/count is entered."""

from app.core.database import SessionLocal
from app.items.models import Item
from app.items.service import get_default_warehouse
from app.warehouses.models import Warehouse

CATALOG = [
	# (barcode, item_name, category, retail_price, stock_qty)
	("BIOMAX-3L", "BioMax 3L", "Products", 6.00, 40),
	("BIOMAX-700ML", "BioMax 700ML", "Products", 2.50, 60),
	("BIOCHLORE-1L", "BioChlore 1L", "Products", 1.00, 80),
	("BIOCHLORE-3L", "BioChlore 3L", "Products", 2.50, 50),
	("BIOCHLORE-4L", "BioChlore Bleach Cleaner 4L", "Products", 3.20, 35),
	("BIOSAFE-3L", "BioSafe 3L", "Products", 3.70, 30),
	("BIOSAFE-500ML", "BioSafe 500ML", "Products", 1.15, 45),
	("BIOSHINE-1L", "BioShine 1L", "Products", 1.50, 40),
	("BIOSHINE-3L", "BioShine 3L", "Products", 3.00, 25),
	("BIOFRESH-500ML", "BioFresh 500ML", "Products", 3.00, 30),
	("BIOSPOT-700ML", "BioSpot 700ML", "Products", 5.50, 20),
	("BIOSTEP-200ML", "BioStep 200ML", "Products", 1.50, 40),
	("BIOWIPE-4L", "BioWipe 4L", "Products", 3.00, 25),
	("BIOWIPE-700ML", "BioWipe 700ML", "Products", 1.00, 50),
	("BIOASEPTIC-4L", "Bio Aseptic Dettol Antiseptic 4L", "Products", 4.50, 20),
	("BIOBOOST-3L", "Bio Boost Laundry Washing Liquid for Black 3L", "Products", 4.20, 25),
	("BIODESCALER-4L", "Bio Descaler Industrial Strength 4L", "Products", 4.80, 15),
	("BIODISH-4L", "Bio Dish Wash (Value Line) 4L", "Products", 3.50, 35),
	("BIOFABRIC-700ML", "Bio Fabric Ironing Softener Liquid 700ML", "Products", 2.00, 30),
	("BIOFLOOR-4L", "Bio Floor Cleaner (Value Line) 4L", "Products", 3.00, 30),
	("DISH-700ML", "Dish Wash 700ML", "Products", 1.00, 60),
	("DISH-3L", "Dish Wash 3L", "Products", 4.00, 35),
	("LAUNDRY-3L", "Laundry Liquid 3L", "Products", 4.50, 30),
	("FLOOR-1.25L", "Floor Cleaner 1.25L", "Products", 1.00, 50),
	("FLOOR-3L", "Floor Cleaner 3L", "Products", 3.00, 35),
	("SOFT-3L", "Fabric Softener 3L", "Products", 4.00, 30),
	("SOAP-500ML", "Hand Soap 500ML", "Products", 1.00, 55),
	("SOAP-3L", "Hand Soap 3L", "Products", 4.00, 30),
	("SHOWERGEL-700ML", "Shower Gel 700ML", "Products", 1.50, 40),
	("APRON-DISPOSABLE", "Disposable Apron", "Disposables", 0.50, 200),
]


def seed():
	db = SessionLocal()
	try:
		if db.query(Item).count() > 0:
			print("Items table already has data - skipping seed.")
			return

		if not db.query(Warehouse).filter(Warehouse.is_default.is_(True)).first():
			db.add(Warehouse(name="Main Store", is_default=True))
			db.commit()
		warehouse = get_default_warehouse(db)

		for barcode, item_name, category, retail_price, stock_qty in CATALOG:
			item = Item(
				item_name=item_name,
				category=category,
				uom="PCS",
				barcode=barcode,
				cost_price=round(retail_price * 0.6, 2),
				retail_price=retail_price,
				wholesale_price=round(retail_price * 0.8, 2),
				reorder_level=10,
			)
			db.add(item)
			db.flush()
			db.execute(
				Item.__table__.metadata.tables["item_stock"].insert().values(
					item_id=item.id, warehouse_id=warehouse.id, qty=stock_qty
				)
			)
		db.commit()
		print(f"Seeded {len(CATALOG)} items.")
	finally:
		db.close()


if __name__ == "__main__":
	seed()
